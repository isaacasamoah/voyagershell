use crate::system::poll;
use anyhow::Result;
use serde::{Serialize, Serializer};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[derive(Clone, Copy, Debug)]
pub struct Owed {
    within: Duration,
}

impl Owed {
    const fn secs(secs: u64) -> Self {
        Self {
            within: Duration::from_secs(secs),
        }
    }

    const fn millis(millis: u64) -> Self {
        Self {
            within: Duration::from_millis(millis),
        }
    }

    pub fn within(&self) -> Duration {
        self.within
    }
}

pub const CORE_DEADLINE: Owed = Owed::secs(20);
pub const PAST_CORE_DEADLINE: Owed = Owed::secs(24);
pub const CORE_SILENT: Owed = Owed::secs(60);
pub const CANVAS_REFRESH: Owed = Owed::secs(3);
pub const AGENTS_ROW: Owed = Owed::secs(1);
pub const VESSEL_CLOSED: Owed = Owed::secs(1);
pub const FLOAT_SPACING: Owed = Owed::millis(90);
pub const STATUS_AFTER_CLICK: Owed = Owed::millis(600);
pub const PROBE_AFTER_DOCK: Owed = Owed::millis(50);
pub const PROBE_LATEST: Owed = Owed::millis(60);
pub const ENGINE_START: Owed = Owed::secs(90);
pub const QUIET_MIC: Owed = Owed::secs(2);
pub const LONG_SILENCE: Owed = Owed::secs(12);
pub const REPLY_WAIT: Owed = Owed::secs(20);
pub const LONG_REPLY_WAIT: Owed = Owed::secs(120);
pub const SEND_WAIT: Owed = Owed::secs(5);
pub const ROOM_FEED: Owed = Owed::secs(330);

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct Elapsed(Duration);

impl Elapsed {
    pub fn within(self, owed: Owed) -> bool {
        self.0 <= owed.within
    }

    pub fn under_share_of(self, hold_ms: u64, parts: u64) -> bool {
        self.0.as_millis() * u128::from(parts) < u128::from(hold_ms)
    }
}

impl Serialize for Elapsed {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_u64(u64::try_from(self.0.as_millis()).unwrap_or(u64::MAX))
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Stopwatch(Instant);

impl Stopwatch {
    pub fn start() -> Self {
        Self(Instant::now())
    }

    pub fn lap(&self) -> Elapsed {
        Elapsed(self.0.elapsed())
    }

    pub fn until(&self, later: Stopwatch) -> Elapsed {
        Elapsed(later.0.duration_since(self.0))
    }
}

pub fn hold(owed: Owed) -> Result<()> {
    poll(owed.within, Duration::from_millis(50), true, || {
        Ok(None::<()>)
    })
    .map(drop)
}

pub fn clock() -> SystemTime {
    SystemTime::now()
}

pub fn epoch_millis(time: SystemTime) -> Result<u64> {
    Ok(u64::try_from(time.duration_since(UNIX_EPOCH)?.as_millis())?)
}

pub fn now_millis() -> u64 {
    epoch_millis(clock()).unwrap_or_default()
}

pub fn after_entry(entered_nanos: u64, owed: Owed) -> SystemTime {
    UNIX_EPOCH + Duration::from_nanos(entered_nanos) + owed.within
}
