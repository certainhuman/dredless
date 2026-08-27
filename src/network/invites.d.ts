export interface InviteMetadata {
    shipId: string | null;
    name: string | null;
    /** CSS RGB color sampled from the preview image's top-left pixel, when available. */
    color?: string | null;
    previewImageUrl: string | null;
    hostname: string;
    inviteCode: string;
}
export interface InviteFetchOptions {
    fetchImpl?: typeof fetch;
    includeColor?: boolean;
}
export function fetchInviteMetadata(invite: string | URL, options?: InviteFetchOptions): Promise<InviteMetadata>;
export function parseInviteMetadata(html: string): InviteMetadata;
