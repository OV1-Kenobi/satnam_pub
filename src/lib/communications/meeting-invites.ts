import { GiftwrappedCommunicationService } from '../giftwrapped-communication-service';

export async function sendMeetingInvite(params: {
  hostNpub: string;
  inviteeNpub: string;
  roomName: string;
  nip05?: string;
}) {
  const svc = new GiftwrappedCommunicationService();
  const payload = {
    type: 'meeting_invitation',
    room: params.roomName,
    url: `https://meet.jit.si/${params.roomName}`,
    host: params.nip05 || params.hostNpub,
    ts: Date.now(),
  };
  return svc.sendGiftwrappedMessage({
    content: JSON.stringify(payload),
    recipient: params.inviteeNpub,
    sender: params.hostNpub,
    encryptionLevel: 'maximum',
    communicationType: 'individual',
  });
}

