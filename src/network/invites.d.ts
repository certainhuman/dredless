export interface InviteMetadata {
    shipId: string | null;
    name: string | null;
    color: string | null;
    previewImageUrl: string | null;
    hostname: string;
    inviteCode: string;
}
export interface InviteFetchOptions { fetchImpl?: typeof fetch; }
export function fetchInviteMetadata(invite: string | URL, options?: InviteFetchOptions): Promise<InviteMetadata>;
export function parseInviteMetadata(html: string): InviteMetadata;
