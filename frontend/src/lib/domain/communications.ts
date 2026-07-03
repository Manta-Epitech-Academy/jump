/**
 * Communications stream for the talent fiche: every broadcast the talent or
 * their parent received, in one chronological list. The fiche is talent-centric,
 * so staff just want to know "quand ce talent a été contacté, et par quoi".
 */

export type CommunicationAudience = 'student' | 'parent';

type CommunicationBase = {
  id: string;
  sentAt: Date;
  audience: CommunicationAudience;
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
    /** Name of the MessageTemplate the campaign was sent from. */
    templateName: string;
  };
};

export type Communication = BroadcastCommunication;
