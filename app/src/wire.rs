use std::io::{self, Read, Write};

pub const MAX_FRAME: usize = 16 * 1024 * 1024;

#[derive(Debug, PartialEq)]
pub struct Frame {
    pub channel: u32,
    pub kind: u8,
    pub payload: Vec<u8>,
}

impl Frame {
    pub fn read_from(reader: &mut impl Read) -> io::Result<Self> {
        let mut header = [0; 9];
        reader.read_exact(&mut header)?;
        let channel = u32::from_le_bytes([header[0], header[1], header[2], header[3]]);
        let length = u32::from_le_bytes([header[5], header[6], header[7], header[8]]) as usize;
        if length > MAX_FRAME {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "Core frame exceeds limit",
            ));
        }
        let mut payload = vec![0; length];
        reader.read_exact(&mut payload)?;
        Ok(Self {
            channel,
            kind: header[4],
            payload,
        })
    }

    pub fn write_to(&self, writer: &mut impl Write) -> io::Result<()> {
        if self.payload.len() > MAX_FRAME {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Core frame exceeds limit",
            ));
        }
        writer.write_all(&self.channel.to_le_bytes())?;
        writer.write_all(&[self.kind])?;
        writer.write_all(&(self.payload.len() as u32).to_le_bytes())?;
        writer.write_all(&self.payload)
    }
}
