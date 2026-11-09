use std::collections::VecDeque;
use voyager_contract::coordination::{Message, Participant, Payload};

#[derive(Default)]
pub(super) struct Inbox {
    pub(super) messages: VecDeque<Message>,
    pub(super) revision: u32,
}

impl Inbox {
    pub(super) fn read(&self, current: &Participant) -> Vec<Message> {
        self.messages
            .iter()
            .filter(|message| {
                &message.to == current
                    && (!message.acknowledged
                        || matches!(message.payload, Payload::Escalation { .. })
                            && !message.resolved)
            })
            .cloned()
            .collect()
    }

    pub(super) fn room(&self, recipient: &Participant) -> Result<(), String> {
        let pending = |message: &&Message| {
            !message.acknowledged
                || matches!(message.payload, Payload::Escalation { .. }) && !message.resolved
        };
        if self
            .messages
            .iter()
            .filter(|message| &message.to == recipient)
            .filter(pending)
            .count()
            >= 32
            || self.messages.iter().filter(pending).count() >= 256
        {
            return Err("The recipient inbox is full. Nothing was recorded or discarded".into());
        }
        if self.revision == u32::MAX {
            return Err("This experiment reached its message limit".into());
        }
        Ok(())
    }

    pub(super) fn post(
        &mut self,
        from: Participant,
        sender_name: String,
        to: Participant,
        payload: Payload,
    ) -> Result<String, String> {
        self.room(&to)?;
        if self.messages.len() == 256 {
            let removable = self.messages.iter().position(|message| {
                message.acknowledged
                    && (!matches!(message.payload, Payload::Escalation { .. }) || message.resolved)
            });
            if let Some(index) = removable {
                self.messages.remove(index);
            } else {
                return Err("The experiment inbox is full. No item was discarded".into());
            }
        }
        self.revision += 1;
        let id = format!("message-{}", self.revision);
        self.messages.push_back(Message {
            id: id.clone(),
            from,
            sender_name,
            to,
            payload,
            acknowledged: false,
            resolved: false,
            via: Vec::new(),
        });
        Ok(id)
    }

    pub(super) fn acknowledge(&mut self, current: &Participant, id: &str) -> Result<(), String> {
        let message = self
            .messages
            .iter_mut()
            .find(|message| message.id == id && &message.to == current)
            .ok_or("This message is not in your inbox")?;
        if !message.acknowledged {
            self.revision = self
                .revision
                .checked_add(1)
                .ok_or("Message limit reached")?;
            message.acknowledged = true;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_keeps_a_message_and_only_the_recipient_can_acknowledge_it() {
        let mut inbox = Inbox::default();
        let sender = Participant::Agent {
            id: voyager_contract::coordination::RunId("sender".into()),
        };
        let id = inbox
            .post(
                sender.clone(),
                "Sender".into(),
                Participant::User,
                Payload::Conversation {
                    text: "Question".into(),
                },
            )
            .unwrap();
        assert_eq!(inbox.read(&Participant::User)[0].id, id);
        assert_eq!(inbox.read(&Participant::User)[0].id, id);
        assert!(inbox.read(&sender).is_empty());
        assert!(inbox.acknowledge(&sender, &id).is_err());
        assert!(!inbox.messages.front().unwrap().acknowledged);
        inbox.acknowledge(&Participant::User, &id).unwrap();
        assert!(inbox.read(&Participant::User).is_empty());
        assert_eq!(inbox.messages.front().unwrap().id, id);
    }
}
