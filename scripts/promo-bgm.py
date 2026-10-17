"""宣传片 BGM：代码合成的原创休闲 lo-fi / 轻爵士，96 BPM，C 大调 Cmaj7–Am7–Dm7–G7 循环。

段落和宣传片时间线（src/promo/timeline.ts）一一对应：一拍 0.625s、一小节 2.5s，共 25 小节 + 尾音。
音色全部自己合成：FM 电钢琴、柔和 pad、圆润贝斯、软底鼓 / 刷鼓 / 摇摆 hi-hat、钢片琴旋律，最后整体过一遍卷积混响。

用法：python scripts/promo-bgm.py out.wav
依赖：numpy、scipy
"""

import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48000
BPM = 96
BEAT = 60 / BPM
BAR = BEAT * 4
BARS = 23
DUR = BARS * BAR + 0.5  # 和视频等长（最后一个和弦在末小节延音淡出）
N = int(DUR * SR)
rng = np.random.default_rng(20261016)

L = np.zeros(N)
R = np.zeros(N)


def note_hz(name: str) -> float:
    names = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}
    n, o = name[:-1], int(name[-1])
    midi = names[n] + (o + 1) * 12
    return 440.0 * 2 ** ((midi - 69) / 12)


def add(sig: np.ndarray, t0: float, pan: float = 0.0, gain: float = 1.0):
    i0 = int(round(t0 * SR))
    if i0 >= N:
        return
    s = sig[: N - i0] * gain
    gl = np.cos((pan + 1) * np.pi / 4)
    gr = np.sin((pan + 1) * np.pi / 4)
    L[i0 : i0 + len(s)] += s * gl
    R[i0 : i0 + len(s)] += s * gr


def env_adsr(n: int, a: float, d: float, s: float, r: float, hold: float) -> np.ndarray:
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-4), 1.0)
    dec = np.where(t >= a, s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)), 1.0)
    e = e * dec
    rel = np.where(t > hold, np.exp(-(t - hold) / max(r, 1e-4)), 1.0)
    return e * rel


# ---------- 音色 ----------


def epiano(f: float, dur: float, vel: float = 1.0) -> np.ndarray:
    """FM 电钢琴：1:1 调制给出温暖的基音，14:1 的轻微「叮」只在起音时出现"""
    n = int((dur + 1.6) * SR)
    t = np.arange(n) / SR
    idx = 1.6 * vel * np.exp(-t / 0.35) + 0.25
    mod = np.sin(2 * np.pi * f * t) * idx
    body = np.sin(2 * np.pi * f * t + mod)
    tine = np.sin(2 * np.pi * f * 14 * t) * np.exp(-t / 0.03) * 0.12 * vel
    e = env_adsr(n, 0.004, 1.2, 0.35, 0.45, dur)
    trem = 1 + 0.08 * np.sin(2 * np.pi * 4.2 * t)
    return (body + tine) * e * trem * 0.22 * vel


def pad(f: float, dur: float) -> np.ndarray:
    n = int((dur + 1.8) * SR)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for det in (-0.12, 0.0, 0.11):
        ff = f * 2 ** (det / 12)
        for h, w in ((1, 1.0), (2, 0.32), (3, 0.12), (4, 0.05)):
            s += w * np.sin(2 * np.pi * ff * h * t + rng.uniform(0, 6.28))
    e = env_adsr(n, 0.9, 2.0, 0.85, 1.2, dur)
    return s * e * 0.035


def bass(f: float, dur: float, vel: float = 1.0) -> np.ndarray:
    n = int((dur + 0.4) * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * t) + 0.22 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.25) + 0.06 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t / 0.1)
    e = env_adsr(n, 0.008, 0.5, 0.6, 0.12, dur * 0.92)
    return s * e * 0.34 * vel


def glock(f: float, vel: float = 1.0) -> np.ndarray:
    """钢片琴 / 木琴：非谐泛音快速衰减"""
    n = int(2.2 * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.7) + 0.35 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / 0.18) + 0.12 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t / 0.06)
    a = np.minimum(1, t / 0.002)
    return s * a * 0.13 * vel


def kick(vel: float = 1.0) -> np.ndarray:
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 46 + 70 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t / 0.16) * 0.5 * vel


SOS_BRUSH = butter(2, [1800, 7000], btype="band", fs=SR, output="sos")
SOS_HAT = butter(2, 7000, btype="high", fs=SR, output="sos")
SOS_SNARE = butter(2, [700, 5000], btype="band", fs=SR, output="sos")


def brush(vel: float = 1.0) -> np.ndarray:
    """刷鼓：一段带缓起的滤波噪声（swish）"""
    n = int(0.32 * SR)
    t = np.arange(n) / SR
    x = sosfilt(SOS_BRUSH, rng.standard_normal(n))
    e = np.minimum(1, t / 0.025) * np.exp(-t / 0.09)
    return x * e * 0.07 * vel


def snare_soft(vel: float = 1.0) -> np.ndarray:
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    x = sosfilt(SOS_SNARE, rng.standard_normal(n)) * np.exp(-t / 0.07)
    body = np.sin(2 * np.pi * 185 * t) * np.exp(-t / 0.05) * 0.4
    return (x * 0.5 + body) * 0.16 * vel


def hat(vel: float = 1.0) -> np.ndarray:
    n = int(0.08 * SR)
    t = np.arange(n) / SR
    return sosfilt(SOS_HAT, rng.standard_normal(n)) * np.exp(-t / 0.018) * 0.045 * vel


# ---------- 编曲 ----------

CHORDS = [
    ("C2", ["E3", "G3", "B3", "D4"]),  # Cmaj9（无根音的左手）
    ("A1", ["C3", "E3", "G3", "B3"]),  # Am9
    ("D2", ["C3", "F3", "A3", "E4"]),  # Dm9
    ("G1", ["B2", "F3", "A3", "E4"]),  # G13
]
FINAL = ("C2", ["E3", "G3", "B3", "D4", "G4"])

SWING = 0.6  # 八分音符摇摆比例


def swing8(i: int) -> float:
    """第 i 个八分音符的起点（拍）"""
    return (i // 2) + (SWING if i % 2 else 0.0)


MEL_A = [(0, "E5", 1), (1, "G5", 0.5), (1.5, "A5", 1.5), (4, "C6", 1), (5, "A5", 0.5), (5.5, "G5", 1.5), (8, "F5", 1), (9, "A5", 0.5), (9.5, "C6", 1), (10.5, "D6", 0.5), (11, "C6", 1), (12, "B5", 1.5), (13.5, "G5", 0.5), (14, "D5", 2)]
MEL_B = [(0, "G5", 0.5), (0.5, "E5", 0.5), (1, "C5", 1), (2, "D5", 0.5), (2.5, "E5", 1.5), (4, "E5", 1), (5, "C5", 0.5), (5.5, "A4", 1.5), (8, "A4", 0.5), (8.5, "C5", 0.5), (9, "D5", 1), (10, "F5", 1), (12, "G5", 1), (13, "F5", 0.5), (13.5, "D5", 0.5), (14, "B4", 2)]


def bar_t(b: int) -> float:
    return b * BAR


def section(b: int) -> str:
    # 与时间线对应：0 开场 | 1-2 一键布置 | 3-5 住户设定 | 6-7 风格快切 | 8-10 户型规模 × 地区 | 11-12 昼夜（12 小节后半进画面效果）
    # | 13-14 画面效果 | 15-17 平面图 | 18-19 素材库 | 20-21 猫 | 22 结尾字标
    if b == 0:
        return "intro"
    if b <= 2:
        return "build"
    if b <= 5:
        return "light"
    if b <= 10:
        return "full"
    if b == 11:
        return "soft"
    if b <= 14:
        return "full"
    if b <= 17:
        return "light"
    if b <= 19:
        return "full"
    if b <= 21:
        return "outro"
    return "final"


def chord_of(b: int):
    # 从 Dm9 起（ii–V–I–vi），这样倒数第二小节正好是 G13，最后一小节落到 Cmaj9
    return CHORDS[(b + 2) % 4]


for b in range(BARS):
    sec = section(b)
    t0 = bar_t(b)
    root, voicing = FINAL if sec == "final" else chord_of(b)
    # 和声：pad 长音 + 电钢琴（切分节奏的和弦）
    if sec == "final":
        for k, nn in enumerate(voicing):
            add(epiano(note_hz(nn), 3.2, 0.85), t0 + k * 0.035, pan=-0.25 + 0.12 * k)
            add(pad(note_hz(nn), 3.0), t0, pan=0.2 - 0.1 * k)
        add(bass(note_hz(root), 3.0, 0.9), t0)
        add(glock(note_hz("G5"), 0.8), t0 + BEAT * 0.5, pan=0.3)
        add(glock(note_hz("C6"), 0.7), t0 + BEAT * 1.0, pan=0.35)
        add(glock(note_hz("E6"), 0.55), t0 + BEAT * 1.5, pan=0.4)
        continue
    for nn in voicing:
        add(pad(note_hz(nn), BAR - 0.1), t0, pan=rng.uniform(-0.4, 0.4), gain=0.8 if sec in ("full",) else 1.0)
    comp = [(0, 1.4), (1.5 + (SWING - 0.5), 0.45), (2.5 + (SWING - 0.5) * 0, 1.0)] if sec in ("full", "build") else [(0, 3.6)]
    if sec == "intro":
        comp = [(0, 3.8)]
    for beat, length in comp:
        for k, nn in enumerate(voicing):
            v = 0.9 if beat == 0 else 0.6
            add(epiano(note_hz(nn), length * BEAT, v), t0 + beat * BEAT + k * 0.012, pan=-0.3 + 0.2 * k)
    # 贝斯：根音 + 第四拍走向下一和弦的经过音
    if sec != "intro":
        nxt = chord_of(b + 1)[0] if b + 1 < BARS - 1 else FINAL[0]
        f_root = note_hz(root)
        f_next = note_hz(nxt)
        add(bass(f_root, BEAT * 1.4), t0)
        add(bass(f_root * 1.5, BEAT * 0.5, 0.7), t0 + BEAT * 1.5 + (SWING - 0.5) * BEAT)
        if sec in ("full", "build", "light"):
            add(bass(f_root * 2, BEAT * 0.8, 0.75), t0 + BEAT * 2)
        approach = f_next * (2 ** (1 / 12)) if f_next < f_root else f_next * (2 ** (-1 / 12))
        add(bass(approach, BEAT * 0.8, 0.8), t0 + BEAT * 3)
    # 鼓
    if sec in ("build", "full", "light", "soft", "outro"):
        kv = {"build": 0.75, "full": 1.0, "light": 0.7, "soft": 0.55, "outro": 0.5}[sec]
        add(kick(kv), t0)
        if sec in ("full", "build"):
            add(kick(kv * 0.7), t0 + BEAT * 2.5 + (SWING - 0.5) * BEAT)
        else:
            add(kick(kv * 0.8), t0 + BEAT * 2)
        for beat in (1, 3):
            if sec == "full":
                add(snare_soft(0.9), t0 + beat * BEAT, pan=0.1)
            add(brush(1.0 if sec != "soft" else 0.7), t0 + beat * BEAT - 0.02, pan=0.15)
        if sec in ("full", "build", "light"):
            for i in range(8):
                add(hat(1.0 if i % 2 == 0 else 0.6), t0 + swing8(i) * BEAT, pan=-0.35)
    # 旋律（钢片琴）：风格快切、地区、画面效果、素材库段落
    mel = None
    phase = (b + 2) % 4
    if 6 <= b <= 10:
        mel = MEL_A if b <= 7 else MEL_B
    elif 13 <= b <= 14:
        mel = MEL_B
    elif 18 <= b <= 19:
        mel = MEL_A
    elif 20 <= b <= 21:
        mel = MEL_B
    if mel is not None:
        for beat, nn, length in mel:
            if phase * 4 <= beat < phase * 4 + 4:
                bt = beat - phase * 4
                frac = bt % 1
                bt = int(bt) + (SWING if abs(frac - 0.5) < 1e-6 else frac)
                vel = 0.75 if b >= 20 else 1.0
                add(glock(note_hz(nn), vel), t0 + bt * BEAT, pan=0.3)
                if 13 <= b <= 14:
                    add(epiano(note_hz(nn), length * BEAT * 0.9, 0.5), t0 + bt * BEAT, pan=0.25, gain=0.6)

# ---------- 混音 ----------

# 卷积混响：指数衰减的立体声噪声冲激响应（约 2.2s），轻微预延迟
ir_n = int(2.4 * SR)
tt = np.arange(ir_n) / SR
decay = np.exp(-tt / 0.55)
sos_ir = butter(1, 5000, btype="low", fs=SR, output="sos")
irL = sosfilt(sos_ir, rng.standard_normal(ir_n)) * decay
irR = sosfilt(sos_ir, rng.standard_normal(ir_n)) * decay
pre = int(0.018 * SR)
irL = np.concatenate([np.zeros(pre), irL])
irR = np.concatenate([np.zeros(pre), irR])
irL /= np.sqrt(np.sum(irL**2))
irR /= np.sqrt(np.sum(irR**2))
wetL = fftconvolve(L, irL)[:N]
wetR = fftconvolve(R, irR)[:N]
mixL = L + 0.28 * wetL
mixR = R + 0.28 * wetR

# 低频收一点、整体轻柔的 lo-fi 高频滚降
sos_hp = butter(2, 32, btype="high", fs=SR, output="sos")
sos_lp = butter(2, 11000, btype="low", fs=SR, output="sos")
mixL = sosfilt(sos_lp, sosfilt(sos_hp, mixL))
mixR = sosfilt(sos_lp, sosfilt(sos_hp, mixR))

# 淡入 1s；最后一个和弦（第 25 小节）延音淡出到结尾
t = np.arange(N) / SR
fade_in = np.minimum(1, t / 1.0)
end0 = (BARS - 1) * BAR + 0.6
fade_out = np.where(t < end0, 1.0, np.maximum(0, np.cos(np.clip((t - end0) / (DUR - end0), 0, 1) * np.pi / 2)) ** 1.5)
mixL *= fade_in * fade_out
mixR *= fade_in * fade_out

# 柔和限幅
peak = max(np.max(np.abs(mixL)), np.max(np.abs(mixR)))
mixL = np.tanh(mixL / peak * 1.2) / np.tanh(1.2) * 0.89
mixR = np.tanh(mixR / peak * 1.2) / np.tanh(1.2) * 0.89

out = np.stack([mixL, mixR], axis=1)
wavfile.write(sys.argv[1] if len(sys.argv) > 1 else "bgm.wav", SR, (out * 32767).astype(np.int16))
print("wrote", DUR, "s")
