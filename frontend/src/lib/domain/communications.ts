/**
 * Unified communications stream for the talent fiche: every email touching
 * a given talent, sent OR received, in one chronological list. Reminders are
 * 1:1 messages staff sent manually (relances); broadcasts are mass campaigns
 * the talent or their parent received. The fiche is talent-centric, so the
 * distinction matters less than the timeline — staff just want to know "qui
 * nous a contacté ce talent, et quand".
 */

export type CommunicationAudience = 'student' | 'parent';

type CommunicationBase = {
  id: string;
  sentAt: Date;
  audience: CommunicationAudience;
};

export type ReminderCommunication = CommunicationBase & {
  kind: 'reminder';
  /** 'email' is the primary nudge; 'sms' is the link-free escalation. */
  channel: 'email' | 'sms';
  subject: string | null;
  body: string | null;
  sender: { name: string | null; email: string | null } | null;
};

export type BroadcastCommunication = CommunicationBase & {
  kind: 'broadcast';
  status: 'pending' | 'sent' | 'failed';
  openedAt: Date | null;
  channel: 'mail' | 'sms';
  broadcast: {
    id: string;
    name: string;
    subjectSnapshot: string | null;
  };
};

export type Communication = ReminderCommunication | BroadcastCommunication;
