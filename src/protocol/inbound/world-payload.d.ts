export function decodeWorldPayload(data: Uint8Array | ArrayBuffer | number[], worldId: number, seed: number): unknown;
export function decodeModelPayload(data: Uint8Array | ArrayBuffer | number[], worldId: number, seed: number): Uint8Array;
export function decompressWorldChunk(data: Uint8Array | ArrayBuffer | number[]): Uint8Array;
