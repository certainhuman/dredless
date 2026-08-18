export const DEFAULT_BASE_URL = "https://drednot.io";
export const DEFAULT_GAME_VERSION = null;
export const DEFAULT_NOTICE_VERSION = 17;

export const encoder = new TextEncoder();
export const decoder = new TextDecoder("utf-8");

export const SHARED_CHACHA_MATERIAL = Uint8Array.from([
    0x15, 0x85, 0x59, 0xc6, 0x26, 0xc4, 0x31, 0x32,
    0xb8, 0xed, 0xb2, 0xfe, 0x5b, 0x87, 0x5e, 0x5e,
    0x3d, 0xd9, 0xe3, 0xcc, 0xa3, 0x9b, 0xd6, 0x58,
    0xe2, 0xdc, 0x0e, 0x8b, 0x96, 0xb7, 0x05, 0x88,
    0x78, 0xd1, 0xd4, 0xa4, 0x19, 0x3c, 0xb9, 0x1e,
    0xbe, 0x78, 0x18, 0x12
]);

export const JOIN_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";
export const KEEPALIVE_INTERVAL_MS = 15_000;
export const INITIAL_OUTFIT_MESSAGE = {
    type: 7,
    outfit: {
        color_body: 4695355,
        color_legs: 1393785,
        color_skin: 13212550,
        color_feet: 6242065,
        color_hair: 1118481,
        style_hair: 0,
        color_hat: 16716049,
        style_hat: 0,
        color_face_1: 8421504,
        style_face_1: 0,
        color_face_2: 8421504,
        style_face_2: 0
    }
};
export const KEEPALIVE_MESSAGE = {type: 2, msg: "/"};

export const COMMAND_FIELDS = [
    "type", "n", "x", "y", "mx", "my", "vx", "vy",
    "jump", "jump_held", "drop", "act1", "act1_held", "exit", "act2", "act_alt", "act_alt_held",
    "wrench_mode", "turret_mode", "scr_w", "scr_h", "motion",
    "focus_ent", "config_ent", "tip_select", "inv_slot", "blur", "drag"
];

export const COMMAND_DEFAULT_FORMATS = {
    type: "positive-fixint",
    n: "uint16",
    x: "float32",
    y: "float32",
    mx: "float32",
    my: "float32",
    vx: "float32",
    vy: "float32",
    jump: "bool",
    jump_held: "bool",
    drop: "bool",
    act1: "bool",
    act1_held: "bool",
    exit: "bool",
    act2: "bool",
    act_alt: "bool",
    act_alt_held: "bool",
    wrench_mode: "positive-fixint",
    turret_mode: "positive-fixint",
    scr_w: "uint16",
    scr_h: "uint16",
    motion: "float32",
    focus_ent: "nil",
    config_ent: "nil",
    tip_select: "nil",
    inv_slot: "positive-fixint",
    blur: "bool",
    drag: "nil"
};
