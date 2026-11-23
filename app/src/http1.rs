use std::{
    io::{self, BufRead, BufReader, Read, Write},
    net::{Ipv4Addr, SocketAddr, TcpStream},
    ops::ControlFlow,
    time::Duration,
};

pub(crate) struct Response {
    pub status: u16,
    pub body: Vec<u8>,
}

fn open(port: u16, deadline: Duration) -> io::Result<TcpStream> {
    let stream =
        TcpStream::connect_timeout(&SocketAddr::from((Ipv4Addr::LOCALHOST, port)), deadline)?;
    stream.set_read_timeout(Some(deadline))?;
    stream.set_write_timeout(Some(deadline))?;
    stream.set_nodelay(true)?;
    Ok(stream)
}

fn send(stream: &mut TcpStream, method: &str, path: &str, body: &[u8]) -> io::Result<()> {
    let head = [
        format!("{method} {path} HTTP/1.1"),
        "Host: 127.0.0.1".to_owned(),
        "Connection: close".to_owned(),
        "Content-Type: application/json".to_owned(),
        format!("Content-Length: {}", body.len()),
        String::new(),
        String::new(),
    ]
    .join("\r\n");
    stream.write_all(head.as_bytes())?;
    stream.write_all(body)?;
    stream.flush()
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message.to_owned())
}

fn read_head(reader: &mut impl BufRead) -> io::Result<(u16, Option<usize>, bool)> {
    let mut line = String::new();
    reader.read_line(&mut line)?;
    let status = line
        .split_whitespace()
        .nth(1)
        .and_then(|code| code.parse().ok())
        .ok_or_else(|| invalid("The engine sent no status line"))?;
    let mut length = None;
    let mut chunked = false;
    loop {
        line.clear();
        if reader.read_line(&mut line)? == 0 {
            return Err(invalid("The engine closed the connection in its headers"));
        }
        let header = line.trim_end();
        if header.is_empty() {
            break;
        }
        if let Some((name, value)) = header.split_once(':') {
            let value = value.trim();
            match name.to_ascii_lowercase().as_str() {
                "content-length" => length = value.parse().ok(),
                "transfer-encoding" => chunked = value.eq_ignore_ascii_case("chunked"),
                _ => {}
            }
        }
    }
    Ok((status, length, chunked))
}

fn read_chunks(
    reader: &mut impl BufRead,
    mut sink: impl FnMut(&[u8]) -> ControlFlow<()>,
) -> io::Result<()> {
    loop {
        let mut line = String::new();
        reader.read_line(&mut line)?;
        let size = usize::from_str_radix(line.trim().split(';').next().unwrap_or(""), 16)
            .map_err(|_| invalid("The engine sent a bad chunk size"))?;
        if size == 0 {
            return Ok(());
        }
        let mut chunk = vec![0; size];
        reader.read_exact(&mut chunk)?;
        if sink(&chunk).is_break() {
            return Ok(());
        }
        let mut end = [0; 2];
        reader.read_exact(&mut end)?;
    }
}

pub(crate) fn stream(
    port: u16,
    method: &str,
    path: &str,
    body: &[u8],
    deadline: Duration,
    mut sink: impl FnMut(&[u8]) -> ControlFlow<()>,
) -> io::Result<u16> {
    let mut socket = open(port, deadline)?;
    send(&mut socket, method, path, body)?;
    let mut reader = BufReader::new(socket);
    let (status, length, chunked) = read_head(&mut reader)?;
    if chunked {
        read_chunks(&mut reader, &mut sink)?;
    } else if let Some(length) = length {
        let mut remaining = length;
        let mut buffer = [0; 8192];
        while remaining > 0 {
            let want = remaining.min(buffer.len());
            let count = reader.read(&mut buffer[..want])?;
            if count == 0 {
                return Err(invalid("The engine closed before its body ended"));
            }
            if sink(&buffer[..count]).is_break() {
                break;
            }
            remaining -= count;
        }
    } else {
        let mut buffer = [0; 8192];
        loop {
            let count = reader.read(&mut buffer)?;
            if count == 0 || sink(&buffer[..count]).is_break() {
                break;
            }
        }
    }
    Ok(status)
}

pub(crate) fn request(
    port: u16,
    method: &str,
    path: &str,
    body: &[u8],
    deadline: Duration,
) -> io::Result<Response> {
    let mut collected = Vec::new();
    let status = stream(port, method, path, body, deadline, |bytes| {
        collected.extend_from_slice(bytes);
        ControlFlow::Continue(())
    })?;
    Ok(Response {
        status,
        body: collected,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    fn serve(reply: &'static [u8]) -> u16 {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut head = [0; 1024];
            let _ = socket.read(&mut head);
            socket.write_all(reply).unwrap();
        });
        port
    }

    #[test]
    fn a_length_body_is_read_whole() {
        let port = serve(b"HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhello");
        let response = request(port, "GET", "/health", b"", Duration::from_secs(2)).unwrap();
        assert_eq!(
            (response.status, response.body.as_slice()),
            (200, &b"hello"[..])
        );
    }

    #[test]
    fn a_chunked_body_arrives_chunk_by_chunk() {
        let port = serve(
            b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n3\r\nabc\r\n2\r\nde\r\n0\r\n\r\n",
        );
        let mut seen = Vec::new();
        let status = stream(port, "POST", "/x", b"{}", Duration::from_secs(2), |bytes| {
            seen.push(bytes.to_vec());
            ControlFlow::Continue(())
        })
        .unwrap();
        assert_eq!(status, 200);
        assert_eq!(seen, vec![b"abc".to_vec(), b"de".to_vec()]);
    }

    #[test]
    fn a_sink_that_breaks_stops_the_read_at_that_chunk() {
        let port = serve(
            b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n3\r\nabc\r\n2\r\nde\r\n0\r\n\r\n",
        );
        let mut seen = Vec::new();
        let status = stream(port, "POST", "/x", b"{}", Duration::from_secs(2), |bytes| {
            seen.push(bytes.to_vec());
            ControlFlow::Break(())
        })
        .unwrap();
        assert_eq!(status, 200);
        assert_eq!(seen, vec![b"abc".to_vec()]);
    }

    #[test]
    fn a_refusal_status_is_returned_with_its_body() {
        let port = serve(b"HTTP/1.1 503 Service Unavailable\r\nContent-Length: 4\r\n\r\nbusy");
        let response = request(port, "GET", "/health", b"", Duration::from_secs(2)).unwrap();
        assert_eq!(response.status, 503);
        assert_eq!(response.body, b"busy");
    }

    #[test]
    fn a_closed_port_is_an_error() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        assert!(request(port, "GET", "/health", b"", Duration::from_millis(300)).is_err());
    }
}
