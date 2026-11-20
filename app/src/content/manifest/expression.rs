use serde_json::Value;
use std::collections::BTreeMap;

const FUNCTIONS: &str = "count, first, filter, match";

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum Expr {
    Null,
    Bool(bool),
    Number(f64),
    Text(String),
    Path(Path),
    Not(Box<Expr>),
    Binary(Op, Box<Expr>, Box<Expr>),
    Call(Call),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum Op {
    Eq,
    Ne,
    And,
    Or,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Path {
    pub root: Root,
    pub segments: Vec<Segment>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum Root {
    Field(String),
    Local,
    Param(String),
    Uuid,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum Segment {
    Field(String),
    Index(usize),
    All,
    Select(String, Box<Expr>),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum Function {
    Count,
    First,
    Filter,
    Match,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Call {
    pub function: Function,
    pub subject: Box<Expr>,
    pub named: Vec<(String, Expr)>,
}

struct Parser {
    chars: Vec<char>,
    at: usize,
}

pub(crate) fn parse(source: &str) -> Result<Expr, String> {
    let mut parser = Parser {
        chars: source.chars().collect(),
        at: 0,
    };
    let expr = parser.or()?;
    parser.space();
    match parser.peek() {
        None => Ok(expr),
        Some(found) => Err(parser.fail(&format!("unexpected \"{found}\""))),
    }
}

pub(crate) fn parse_path(source: &str) -> Result<Path, String> {
    match parse(source)? {
        Expr::Path(path) => Ok(path),
        _ => Err(format!("\"{source}\" is not a path")),
    }
}

impl Parser {
    fn fail(&self, message: &str) -> String {
        format!("{message} at column {}", self.at + 1)
    }

    fn peek(&self) -> Option<char> {
        self.chars.get(self.at).copied()
    }

    fn space(&mut self) {
        while self.peek().is_some_and(char::is_whitespace) {
            self.at += 1;
        }
    }

    fn eat(&mut self, token: &str) -> bool {
        self.space();
        let wanted: Vec<char> = token.chars().collect();
        if self.chars[self.at..].starts_with(&wanted) {
            self.at += wanted.len();
            true
        } else {
            false
        }
    }

    fn expect(&mut self, token: &str) -> Result<(), String> {
        if self.eat(token) {
            Ok(())
        } else {
            Err(self.fail(&format!("expected \"{token}\"")))
        }
    }

    fn ident(&mut self) -> Option<String> {
        self.space();
        let start = self.at;
        if !self
            .peek()
            .is_some_and(|found| found.is_ascii_alphabetic() || found == '_')
        {
            return None;
        }
        while self
            .peek()
            .is_some_and(|found| found.is_ascii_alphanumeric() || found == '_')
        {
            self.at += 1;
        }
        Some(self.chars[start..self.at].iter().collect())
    }

    fn digits(&mut self) -> Option<String> {
        self.space();
        let start = self.at;
        while self.peek().is_some_and(|found| found.is_ascii_digit()) {
            self.at += 1;
        }
        (self.at > start).then(|| self.chars[start..self.at].iter().collect())
    }

    fn or(&mut self) -> Result<Expr, String> {
        let mut left = self.and()?;
        while self.eat("||") {
            left = Expr::Binary(Op::Or, Box::new(left), Box::new(self.and()?));
        }
        Ok(left)
    }

    fn and(&mut self) -> Result<Expr, String> {
        let mut left = self.compare()?;
        while self.eat("&&") {
            left = Expr::Binary(Op::And, Box::new(left), Box::new(self.compare()?));
        }
        Ok(left)
    }

    fn compare(&mut self) -> Result<Expr, String> {
        let left = self.unary()?;
        let op = if self.eat("==") {
            Op::Eq
        } else if self.eat("!=") {
            Op::Ne
        } else {
            return Ok(left);
        };
        Ok(Expr::Binary(op, Box::new(left), Box::new(self.unary()?)))
    }

    fn unary(&mut self) -> Result<Expr, String> {
        self.space();
        if self.peek() == Some('!') && self.chars.get(self.at + 1) != Some(&'=') {
            self.at += 1;
            return Ok(Expr::Not(Box::new(self.unary()?)));
        }
        self.primary()
    }

    fn primary(&mut self) -> Result<Expr, String> {
        self.space();
        match self.peek() {
            None => Err(self.fail("expression ends early")),
            Some('(') => {
                self.at += 1;
                let inner = self.or()?;
                self.expect(")")?;
                Ok(inner)
            }
            Some('\'') => self.text(),
            Some(found) if found.is_ascii_digit() || found == '-' => self.number(),
            Some('$') => {
                self.at += 1;
                let name = self
                    .ident()
                    .ok_or_else(|| self.fail("expected a name after $"))?;
                let root = if name == "uuid" {
                    Root::Uuid
                } else {
                    Root::Param(name)
                };
                self.segments(root)
            }
            Some(_) => {
                let name = self.ident().ok_or_else(|| self.fail("expected a value"))?;
                match name.as_str() {
                    "true" => Ok(Expr::Bool(true)),
                    "false" => Ok(Expr::Bool(false)),
                    "null" => Ok(Expr::Null),
                    "local" => self.segments(Root::Local),
                    _ if self.peek() == Some('(') => self.call(&name),
                    _ => self.segments(Root::Field(name)),
                }
            }
        }
    }

    fn text(&mut self) -> Result<Expr, String> {
        self.at += 1;
        let start = self.at;
        while self.peek().is_some_and(|found| found != '\'') {
            self.at += 1;
        }
        if self.peek().is_none() {
            return Err(self.fail("text is not closed"));
        }
        let text = self.chars[start..self.at].iter().collect();
        self.at += 1;
        Ok(Expr::Text(text))
    }

    fn number(&mut self) -> Result<Expr, String> {
        let start = self.at;
        self.at += 1;
        while self
            .peek()
            .is_some_and(|found| found.is_ascii_digit() || found == '.')
        {
            self.at += 1;
        }
        let text: String = self.chars[start..self.at].iter().collect();
        text.parse()
            .map(Expr::Number)
            .map_err(|_| self.fail(&format!("\"{text}\" is not a number")))
    }

    fn segments(&mut self, root: Root) -> Result<Expr, String> {
        let mut segments = Vec::new();
        loop {
            match self.peek() {
                Some('.') => {
                    self.at += 1;
                    let field = self
                        .ident()
                        .ok_or_else(|| self.fail("expected a field name after \".\""))?;
                    segments.push(Segment::Field(field));
                }
                Some('[') => {
                    self.at += 1;
                    segments.push(self.bracket()?);
                    self.expect("]")?;
                }
                _ => return Ok(Expr::Path(Path { root, segments })),
            }
        }
    }

    fn bracket(&mut self) -> Result<Segment, String> {
        self.space();
        if self.peek() == Some('*') {
            self.at += 1;
            return Ok(Segment::All);
        }
        if self.peek().is_some_and(|found| found.is_ascii_digit()) {
            let start = self.at;
            while self.peek().is_some_and(|found| found.is_ascii_digit()) {
                self.at += 1;
            }
            let digits: String = self.chars[start..self.at].iter().collect();
            return digits
                .parse()
                .map(Segment::Index)
                .map_err(|_| self.fail("index is too large"));
        }
        let field = self
            .ident()
            .ok_or_else(|| self.fail("expected an index, * or field=value"))?;
        self.expect("=")?;
        Ok(Segment::Select(field, Box::new(self.unary()?)))
    }

    fn call(&mut self, name: &str) -> Result<Expr, String> {
        let function = match name {
            "count" => Function::Count,
            "first" => Function::First,
            "filter" => Function::Filter,
            "match" => Function::Match,
            _ => {
                return Err(self.fail(&format!(
                    "unknown function \"{name}\" (functions: {FUNCTIONS})"
                )));
            }
        };
        self.expect("(")?;
        let subject = Box::new(self.or()?);
        let mut named = Vec::new();
        while self.eat(",") {
            let key = self
                .ident()
                .or_else(|| self.digits())
                .ok_or_else(|| self.fail("expected a name before \":\""))?;
            self.expect(":")?;
            named.push((key, self.or()?));
        }
        self.expect(")")?;
        Ok(Expr::Call(Call {
            function,
            subject,
            named,
        }))
    }
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum Shape {
    Any,
    Null,
    Bool,
    Number,
    Text,
    List(Box<Shape>),
    Record(Record),
    Either(Vec<Shape>),
}

#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct Record {
    pub fields: Vec<(String, Shape)>,
    pub required: Vec<String>,
    pub closed: bool,
}

impl Record {
    fn field(&self, name: &str) -> Option<&Shape> {
        self.fields
            .iter()
            .find_map(|(field, shape)| (field == name).then_some(shape))
    }

    fn names(&self) -> String {
        if self.fields.is_empty() {
            "none".into()
        } else {
            let mut names: Vec<&str> = self.fields.iter().map(|(name, _)| name.as_str()).collect();
            names.sort_unstable();
            names.join(", ")
        }
    }
}

impl Shape {
    pub(crate) fn from_schema(schema: &Value) -> Result<Self, String> {
        if let Some(values) = schema.get("enum").and_then(Value::as_array) {
            return Ok(Self::either(values.iter().map(Self::of_value).collect()));
        }
        match schema.get("type") {
            None => Ok(Self::Any),
            Some(Value::String(kind)) => Self::of_type(kind, schema),
            Some(Value::Array(kinds)) => Ok(Self::either(
                kinds
                    .iter()
                    .map(|kind| {
                        kind.as_str()
                            .ok_or_else(|| "type must name a kind".to_owned())
                            .and_then(|kind| Self::of_type(kind, schema))
                    })
                    .collect::<Result<_, _>>()?,
            )),
            Some(_) => Err("type must be a name or a list of names".into()),
        }
    }

    pub(crate) fn from_param(spec: &str) -> Result<Self, String> {
        Ok(Self::either(
            spec.split('|')
                .map(|kind| match kind.trim() {
                    "any" => Ok(Self::Any),
                    "string" => Ok(Self::Text),
                    "number" => Ok(Self::Number),
                    "boolean" => Ok(Self::Bool),
                    "null" => Ok(Self::Null),
                    other => Err(format!(
                        "parameter type \"{other}\" is not one of string, number, boolean, null, any"
                    )),
                })
                .collect::<Result<_, _>>()?,
        ))
    }

    fn of_type(kind: &str, schema: &Value) -> Result<Self, String> {
        match kind {
            "string" => Ok(Self::Text),
            "number" | "integer" => Ok(Self::Number),
            "boolean" => Ok(Self::Bool),
            "null" => Ok(Self::Null),
            "array" => Ok(Self::List(Box::new(
                schema
                    .get("items")
                    .map_or(Ok(Self::Any), Self::from_schema)?,
            ))),
            "object" => {
                let mut record = Record {
                    closed: schema.get("additionalProperties") == Some(&Value::Bool(false)),
                    ..Record::default()
                };
                if let Some(properties) = schema.get("properties").and_then(Value::as_object) {
                    for (name, property) in properties {
                        record
                            .fields
                            .push((name.clone(), Self::from_schema(property)?));
                    }
                }
                if let Some(required) = schema.get("required").and_then(Value::as_array) {
                    record.required = required
                        .iter()
                        .filter_map(|name| name.as_str().map(str::to_owned))
                        .collect();
                }
                Ok(Self::Record(record))
            }
            other => Err(format!("unknown type \"{other}\"")),
        }
    }

    pub(crate) fn of_value(value: &Value) -> Self {
        match value {
            Value::Null => Self::Null,
            Value::Bool(_) => Self::Bool,
            Value::Number(_) => Self::Number,
            Value::String(_) => Self::Text,
            Value::Array(_) => Self::List(Box::new(Self::Any)),
            Value::Object(_) => Self::Record(Record::default()),
        }
    }

    fn either(mut shapes: Vec<Self>) -> Self {
        shapes.dedup();
        if shapes.is_empty() {
            Self::Any
        } else if shapes.len() == 1 {
            shapes.remove(0)
        } else {
            Self::Either(shapes)
        }
    }

    pub(crate) fn name(&self) -> String {
        match self {
            Self::Any => "any".into(),
            Self::Null => "null".into(),
            Self::Bool => "boolean".into(),
            Self::Number => "number".into(),
            Self::Text => "string".into(),
            Self::List(_) => "list".into(),
            Self::Record(_) => "object".into(),
            Self::Either(shapes) => shapes.iter().map(Self::name).collect::<Vec<_>>().join("|"),
        }
    }

    pub(crate) fn accepts(&self, got: &Self) -> Result<(), String> {
        match (self, got) {
            (Self::Any, _) | (_, Self::Any) => Ok(()),
            (_, Self::Either(options)) => {
                options.iter().try_for_each(|option| self.accepts(option))
            }
            (Self::Either(options), _) => options
                .iter()
                .any(|option| option.accepts(got).is_ok())
                .then_some(())
                .ok_or_else(|| self.mismatch(got)),
            (Self::List(want), Self::List(have)) => want.accepts(have),
            (Self::Record(want), Self::Record(have)) => want.accepts(have),
            (want, have) if std::mem::discriminant(want) == std::mem::discriminant(have) => Ok(()),
            _ => Err(self.mismatch(got)),
        }
    }

    fn mismatch(&self, got: &Self) -> String {
        format!("expected {}, got {}", self.name(), got.name())
    }
}

impl Record {
    fn accepts(&self, have: &Self) -> Result<(), String> {
        for name in &self.required {
            if have.field(name).is_none() && !have.fields.is_empty() {
                return Err(format!("missing field \"{name}\""));
            }
        }
        for (name, shape) in &have.fields {
            match self.field(name) {
                Some(want) => want
                    .accepts(shape)
                    .map_err(|error| format!("field \"{name}\": {error}"))?,
                None if self.closed => return Err(format!("unexpected field \"{name}\"")),
                None => {}
            }
        }
        Ok(())
    }
}

pub(crate) struct Scope<'a> {
    pub state: &'a Shape,
    pub local: Option<&'a Shape>,
    pub params: &'a BTreeMap<String, Shape>,
}

pub(crate) fn infer_source(source: &str, scope: &Scope, problems: &mut Vec<String>) -> Shape {
    match parse(source) {
        Ok(expr) => infer(&expr, scope, problems),
        Err(error) => {
            problems.push(format!("\"{source}\": {error}"));
            Shape::Any
        }
    }
}

pub(crate) fn infer_template(template: &Value, scope: &Scope, problems: &mut Vec<String>) -> Shape {
    match template {
        Value::String(source) => infer_source(source, scope, problems),
        Value::Array(items) => Shape::List(Box::new(Shape::either(
            items
                .iter()
                .map(|item| infer_template(item, scope, problems))
                .collect(),
        ))),
        Value::Object(fields) => {
            let fields: Vec<(String, Shape)> = fields
                .iter()
                .map(|(name, value)| (name.clone(), infer_template(value, scope, problems)))
                .collect();
            Shape::Record(Record {
                required: fields.iter().map(|(name, _)| name.clone()).collect(),
                fields,
                closed: true,
            })
        }
        other => Shape::of_value(other),
    }
}

pub(crate) fn infer(expr: &Expr, scope: &Scope, problems: &mut Vec<String>) -> Shape {
    match expr {
        Expr::Null => Shape::Null,
        Expr::Bool(_) => Shape::Bool,
        Expr::Number(_) => Shape::Number,
        Expr::Text(_) => Shape::Text,
        Expr::Path(path) => infer_path(path, scope, problems),
        Expr::Not(inner) => {
            expect_bool("!", &infer(inner, scope, problems), problems);
            Shape::Bool
        }
        Expr::Binary(op @ (Op::And | Op::Or), left, right) => {
            let name = if *op == Op::And { "&&" } else { "||" };
            expect_bool(name, &infer(left, scope, problems), problems);
            expect_bool(name, &infer(right, scope, problems), problems);
            Shape::Bool
        }
        Expr::Binary(_, left, right) => {
            let (left, right) = (infer(left, scope, problems), infer(right, scope, problems));
            if left.accepts(&right).is_err() && right.accepts(&left).is_err() {
                problems.push(format!(
                    "cannot compare {} with {}",
                    left.name(),
                    right.name()
                ));
            }
            Shape::Bool
        }
        Expr::Call(call) => infer_call(call, scope, problems),
    }
}

fn expect_bool(operator: &str, got: &Shape, problems: &mut Vec<String>) {
    if let Err(error) = Shape::Bool.accepts(got) {
        problems.push(format!("{operator}: {error}"));
    }
}

fn match_key(subject: &Shape, key: &str) -> Result<(), String> {
    match subject {
        Shape::Any | Shape::Text => Ok(()),
        Shape::Number => key
            .parse::<f64>()
            .map(drop)
            .map_err(|_| "the subject is a number".into()),
        Shape::Bool => matches!(key, "true" | "false")
            .then_some(())
            .ok_or_else(|| "the subject is a boolean, so a key is true or false".into()),
        Shape::Null => (key == "null")
            .then_some(())
            .ok_or_else(|| "the subject is null".into()),
        Shape::Either(options) => options
            .iter()
            .any(|option| match_key(option, key).is_ok())
            .then_some(())
            .ok_or_else(|| format!("the subject is {}", subject.name())),
        other => Err(format!("match needs a single value, got {}", other.name())),
    }
}

fn infer_call(call: &Call, scope: &Scope, problems: &mut Vec<String>) -> Shape {
    let subject = infer(&call.subject, scope, problems);
    if call.function == Function::Match {
        for (key, _) in &call.named {
            if let Err(error) = match_key(&subject, key) {
                problems.push(format!("match key \"{key}\": {error}"));
            }
        }
        let cases = call
            .named
            .iter()
            .map(|(_, case)| infer(case, scope, problems))
            .collect();
        return Shape::either(cases);
    }
    let item = match &subject {
        Shape::List(item) => (**item).clone(),
        Shape::Any => Shape::Any,
        other => {
            problems.push(format!("expected a list, got {}", other.name()));
            Shape::Any
        }
    };
    for (name, value) in &call.named {
        let got = infer(value, scope, problems);
        match &item {
            Shape::Record(record) => match record.field(name) {
                Some(want) => {
                    if let Err(error) = want.accepts(&got) {
                        problems.push(format!("where {name}: {error}"));
                    }
                }
                None => problems.push(format!("where: items have no field \"{name}\"")),
            },
            Shape::Any => {}
            _ => problems.push(format!("where: items have no field \"{name}\"")),
        }
    }
    match call.function {
        Function::Count => Shape::Number,
        Function::First => item,
        Function::Filter => Shape::List(Box::new(item)),
        Function::Match => Shape::Any,
    }
}

pub(crate) fn infer_path(path: &Path, scope: &Scope, problems: &mut Vec<String>) -> Shape {
    let (mut shown, mut current) = match &path.root {
        Root::Uuid => return Shape::Text,
        Root::Param(name) => match scope.params.get(name) {
            Some(shape) => (format!("${name}"), shape.clone()),
            None => {
                let known: Vec<String> = scope.params.keys().map(|key| format!("${key}")).collect();
                problems.push(format!(
                    "unknown name ${name}; in scope: {}",
                    if known.is_empty() {
                        "none".into()
                    } else {
                        known.join(", ")
                    }
                ));
                return Shape::Any;
            }
        },
        Root::Local => match scope.local {
            Some(shape) => ("local".to_owned(), shape.clone()),
            None => {
                problems.push("local state is not declared".into());
                return Shape::Any;
            }
        },
        Root::Field(_) => ("state".to_owned(), scope.state.clone()),
    };
    let root_field = match &path.root {
        Root::Field(name) => Some(Segment::Field(name.clone())),
        _ => None,
    };
    for segment in root_field.iter().chain(&path.segments) {
        match (segment, &current) {
            (Segment::Field(name), Shape::Record(record)) => match record.field(name) {
                Some(shape) => {
                    current = shape.clone();
                    shown = format!("{shown}.{name}");
                }
                None => {
                    problems.push(format!(
                        "{shown} has no field \"{name}\" (fields: {})",
                        record.names()
                    ));
                    return Shape::Any;
                }
            },
            (Segment::Field(_), Shape::Any) => {}
            (Segment::Field(name), other) => {
                problems.push(format!(
                    "{shown} is {}, so it has no field \"{name}\"",
                    other.name()
                ));
                return Shape::Any;
            }
            (Segment::Index(_) | Segment::All | Segment::Select(..), Shape::List(item)) => {
                if let Segment::Select(field, value) = segment {
                    select(item, field, value, scope, &shown, problems);
                }
                current = (**item).clone();
            }
            (Segment::Index(_) | Segment::All | Segment::Select(..), Shape::Any) => {}
            (_, other) => {
                problems.push(format!("{shown} is {}, not a list", other.name()));
                return Shape::Any;
            }
        }
    }
    current
}

fn select(
    item: &Shape,
    field: &str,
    value: &Expr,
    scope: &Scope,
    shown: &str,
    problems: &mut Vec<String>,
) {
    let got = infer(value, scope, problems);
    match item {
        Shape::Record(record) => match record.field(field) {
            Some(want) => {
                if let Err(error) = want.accepts(&got) {
                    problems.push(format!("{shown}[{field}=...]: {error}"));
                }
            }
            None => problems.push(format!(
                "{shown}[{field}=...]: items have no field \"{field}\""
            )),
        },
        Shape::Any => {}
        _ => problems.push(format!(
            "{shown}[{field}=...]: items have no field \"{field}\""
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn state() -> Shape {
        Shape::from_schema(&json!({
            "type":"object","additionalProperties":false,"required":["title","items"],
            "properties":{"title":{"type":"string"},"items":{"type":"array","items":{
                "type":"object","additionalProperties":false,"required":["id","done"],
                "properties":{"id":{"type":"string"},"text":{"type":"string"},"done":{"type":"boolean"}}}}}
        }))
        .unwrap()
    }

    fn check(source: &str, params: &[(&str, Shape)]) -> (Shape, Vec<String>) {
        let state = state();
        let params: BTreeMap<String, Shape> = params
            .iter()
            .map(|(name, shape)| ((*name).to_owned(), shape.clone()))
            .collect();
        let mut problems = Vec::new();
        let shape = infer_source(
            source,
            &Scope {
                state: &state,
                local: None,
                params: &params,
            },
            &mut problems,
        );
        (shape, problems)
    }

    #[test]
    fn grammar_covers_paths_selectors_calls_and_operators() {
        for source in [
            "title",
            "items[id=$id].done",
            "!items[0].done",
            "items[*].text",
            "count(items, done: false) == 2 && title != 'x'",
            "first(items, done: false)",
            "filter(items, done: false)",
            "match(title, a: 'x', b: 'y')",
            "(true || false) && null == null",
        ] {
            assert!(parse(source).is_ok(), "{source}");
        }
    }

    #[test]
    fn grammar_refuses_malformed_input_with_a_column() {
        for source in [
            "items[",
            "count(items",
            "a &&",
            "'open",
            "nope(items)",
            "items.",
            "a b",
        ] {
            let error = parse(source).unwrap_err();
            assert!(
                error.contains("column") || error.contains("unknown function"),
                "{source}: {error}"
            );
        }
    }

    #[test]
    fn inference_types_paths_and_names_the_fix() {
        let (shape, problems) = check("items[id=$id].done", &[("id", Shape::Text)]);
        assert_eq!((shape, problems), (Shape::Bool, vec![]));
        let (_, problems) = check("itemz", &[]);
        assert_eq!(
            problems,
            ["state has no field \"itemz\" (fields: items, title)"]
        );
        let (_, problems) = check("first(items, finished: true)", &[]);
        assert_eq!(problems, ["where: items have no field \"finished\""]);
        let (_, problems) = check("items[id=$nope].done", &[]);
        assert!(problems[0].starts_with("unknown name $nope"));
        let (_, problems) = check("title == 3", &[]);
        assert_eq!(problems, ["cannot compare string with number"]);
    }

    #[test]
    fn assignment_checks_kinds_and_records() {
        assert!(Shape::Bool.accepts(&Shape::Text).is_err());
        assert!(
            Shape::either(vec![Shape::Text, Shape::Null])
                .accepts(&Shape::Null)
                .is_ok()
        );
        let item = match state() {
            Shape::Record(record) => match record.field("items").cloned() {
                Some(Shape::List(item)) => *item,
                other => panic!("{other:?}"),
            },
            other => panic!("{other:?}"),
        };
        let mut problems = Vec::new();
        let state = state();
        let params = BTreeMap::new();
        let scope = Scope {
            state: &state,
            local: None,
            params: &params,
        };
        let made = infer_template(
            &json!({"id":"'a'","done":false,"extra":1}),
            &scope,
            &mut problems,
        );
        assert_eq!(
            item.accepts(&made),
            Err("unexpected field \"extra\"".into())
        );
        let made = infer_template(&json!({"id":"'a'","done":false}), &scope, &mut problems);
        assert_eq!(item.accepts(&made), Ok(()));
        assert!(problems.is_empty());
    }
}
