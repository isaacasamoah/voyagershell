const CONTEXT: usize = 3;
const CELLS: usize = 16 * 1024 * 1024;

#[derive(Clone, Copy, Eq, PartialEq)]
enum Op {
    Same,
    Remove,
    Add,
}

fn lines(text: &str) -> Vec<&str> {
    text.split_inclusive('\n').collect()
}

fn script(old: &[&str], new: &[&str]) -> Vec<Op> {
    let head = old.iter().zip(new).take_while(|(a, b)| a == b).count();
    let tail = old[head..]
        .iter()
        .rev()
        .zip(new[head..].iter().rev())
        .take_while(|(a, b)| a == b)
        .count();
    let (old_mid, new_mid) = (&old[head..old.len() - tail], &new[head..new.len() - tail]);
    let mut ops = vec![Op::Same; head];
    ops.extend(middle(old_mid, new_mid));
    ops.extend(vec![Op::Same; tail]);
    ops
}

fn middle(old: &[&str], new: &[&str]) -> Vec<Op> {
    let (rows, columns) = (old.len() + 1, new.len() + 1);
    if rows.saturating_mul(columns) > CELLS {
        return std::iter::repeat_n(Op::Remove, old.len())
            .chain(std::iter::repeat_n(Op::Add, new.len()))
            .collect();
    }
    let mut longest = vec![0u32; rows * columns];
    for i in (0..old.len()).rev() {
        for j in (0..new.len()).rev() {
            longest[i * columns + j] = if old[i] == new[j] {
                longest[(i + 1) * columns + j + 1] + 1
            } else {
                longest[(i + 1) * columns + j].max(longest[i * columns + j + 1])
            };
        }
    }
    let (mut i, mut j, mut ops) = (0, 0, Vec::new());
    while i < old.len() && j < new.len() {
        if old[i] == new[j] {
            ops.push(Op::Same);
            i += 1;
            j += 1;
        } else if longest[(i + 1) * columns + j] >= longest[i * columns + j + 1] {
            ops.push(Op::Remove);
            i += 1;
        } else {
            ops.push(Op::Add);
            j += 1;
        }
    }
    ops.extend(std::iter::repeat_n(Op::Remove, old.len() - i));
    ops.extend(std::iter::repeat_n(Op::Add, new.len() - j));
    ops
}

fn emit(out: &mut String, sign: char, line: &str) {
    out.push(sign);
    out.push_str(line);
    if !line.ends_with('\n') {
        out.push_str("\n\\ No newline at end of file\n");
    }
}

fn range(start: usize, length: usize) -> String {
    match length {
        1 => format!("{}", start + 1),
        0 => format!("{start},0"),
        _ => format!("{},{length}", start + 1),
    }
}

pub(super) fn unified(old_label: &str, new_label: &str, old: &str, new: &str) -> String {
    let (old_lines, new_lines) = (lines(old), lines(new));
    let ops = script(&old_lines, &new_lines);
    let changed = ops
        .iter()
        .enumerate()
        .filter(|(_, op)| **op != Op::Same)
        .map(|(at, _)| at)
        .collect::<Vec<_>>();
    let mut out = format!("--- {old_label}\n+++ {new_label}\n");
    let mut at = 0;
    while at < changed.len() {
        let mut last = at;
        while last + 1 < changed.len() && changed[last + 1] - changed[last] <= 2 * CONTEXT + 1 {
            last += 1;
        }
        let start = changed[at].saturating_sub(CONTEXT);
        let end = (changed[last] + CONTEXT + 1).min(ops.len());
        let (mut old_at, mut new_at) = (0, 0);
        for op in &ops[..start] {
            old_at += usize::from(*op != Op::Add);
            new_at += usize::from(*op != Op::Remove);
        }
        let (first_old, first_new) = (old_at, new_at);
        let mut body = String::new();
        for op in &ops[start..end] {
            match op {
                Op::Same => {
                    emit(&mut body, ' ', old_lines[old_at]);
                    old_at += 1;
                    new_at += 1;
                }
                Op::Remove => {
                    emit(&mut body, '-', old_lines[old_at]);
                    old_at += 1;
                }
                Op::Add => {
                    emit(&mut body, '+', new_lines[new_at]);
                    new_at += 1;
                }
            }
        }
        out.push_str(&format!(
            "@@ -{} +{} @@\n",
            range(first_old, old_at - first_old),
            range(first_new, new_at - first_new)
        ));
        out.push_str(&body);
        at = last + 1;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::unified;

    #[test]
    fn a_changed_line_shows_with_its_neighbours() {
        let diff = unified("a", "b", "one\ntwo\nthree\n", "one\n2\nthree\n");
        assert_eq!(
            diff,
            "--- a\n+++ b\n@@ -1,3 +1,3 @@\n one\n-two\n+2\n three\n"
        );
    }

    #[test]
    fn identical_text_has_no_hunk_and_a_missing_final_newline_is_a_change() {
        assert_eq!(unified("a", "b", "x\n", "x\n"), "--- a\n+++ b\n");
        assert_eq!(
            unified("a", "b", "x", "x\n"),
            "--- a\n+++ b\n@@ -1 +1 @@\n-x\n\\ No newline at end of file\n+x\n"
        );
    }

    #[test]
    fn distant_changes_make_separate_hunks() {
        let old = (0..30).map(|n| format!("{n}\n")).collect::<String>();
        let new = old.replacen("1\n", "one\n", 1).replacen("28\n", "end\n", 1);
        let diff = unified("a", "b", &old, &new);
        assert_eq!(diff.matches("@@ ").count(), 2);
    }
}
