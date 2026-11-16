"""Generates gift-levelup.json: a Lottie animation of the level-up gift box (box shakes, lid pops, glasses rise, rays, confetti).
Hand-built shape layers in the app's flat style. Run: python make_gift.py"""
import json, math, os

W = H = 400
FR, OP = 60, 150


def col(h, a=1):
    h = h.lstrip('#')
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)] + [a]


def st(v):
    return {"a": 0, "k": v}


def kf(frames, ease=(0.4, 1, 0.6, 0)):
    """frames: list of (t, value). value is number or list."""
    out = []
    for i, (t, v) in enumerate(frames):
        v = v if isinstance(v, list) else [v]
        k = {"t": t, "s": v}
        if i < len(frames) - 1:
            k["i"] = {"x": [ease[0]], "y": [ease[1]]}
            k["o"] = {"x": [ease[2]], "y": [ease[3]]}
        out.append(k)
    return {"a": 1, "k": out}


def tr(p=(0, 0), a=(0, 0), s=(100, 100), r=0, o=100):
    return {"ty": "tr", "p": st(list(p)), "a": st(list(a)), "s": st(list(s)), "r": st(r), "o": st(o), "sk": st(0), "sa": st(0)}


def rect(x, y, w, h, r=0):
    return {"ty": "rc", "d": 1, "p": st([x, y]), "s": st([w, h]), "r": st(r)}


def ell(x, y, w, h):
    return {"ty": "el", "d": 1, "p": st([x, y]), "s": st([w, h])}


def path(pts, closed=True, ins=None, outs=None):
    n = len(pts)
    return {"ty": "sh", "ks": st({"i": ins or [[0, 0]] * n, "o": outs or [[0, 0]] * n, "v": pts, "c": closed})}


def fill(c, o=100):
    return {"ty": "fl", "c": st(col(c)), "o": st(o), "r": 1}


def stroke(c, w, o=100):
    return {"ty": "st", "c": st(col(c)), "o": st(o), "w": st(w), "lc": 2, "lj": 2}


def grp(items, name="g", t=None):
    return {"ty": "gr", "nm": name, "it": items + [t or tr()]}


def layer(name, shapes, ks, ip=0, op=OP, ind=[0]):
    ind[0] += 1
    return {"ddd": 0, "ind": ind[0], "ty": 4, "nm": name, "sr": 1, "ks": ks, "ao": 0, "shapes": shapes, "ip": ip, "op": op, "st": 0, "bm": 0}


def ks(p=None, a=(0, 0), s=None, r=None, o=None):
    return {"o": o or st(100), "r": r or st(0), "p": p or st([0, 0]), "a": st(list(a) + [0]), "s": s or st([100, 100, 100])}


CX, BASE = 200, 300
shake = [(0, 0), (8, -7), (16, 7), (24, -7), (32, 6), (40, -3), (46, 0)]
squash = kf([(0, [100, 100, 100]), (40, [100, 100, 100]), (46, [112, 86, 100]), (54, [96, 106, 100]), (62, [100, 100, 100])])

layers = []

# confetti (top)
cols = ['#ff7a9c', '#ffc83d', '#46b35a', '#1c8fe3', '#a78bfa', '#ff9a4d']
for i in range(16):
    ang = -math.pi / 2 + (i - 7.5) * 0.19
    dist = 150 + (i % 4) * 22
    ex, ey = CX + math.cos(ang) * dist, 190 + math.sin(ang) * dist * 0.9
    layers.append(layer(f"cf{i}", [grp([rect(0, 0, 10, 5 + (i % 3) * 2, 1.5), fill(cols[i % 6])])],
                        ks(p=kf([(54, [CX, 230, 0]), (80, [ex, ey, 0]), (120, [ex + (i % 2 * 2 - 1) * 14, ey + 70, 0])], (0.2, 1, 0.3, 0)),
                           r=kf([(54, 0), (120, 360 * (1 if i % 2 else -1))]),
                           o=kf([(54, 100), (100, 100), (125, 0)])), ip=54, op=130))

# lid
lid = [grp([rect(CX, 196, 168, 34, 9), fill('#ff5c86')], "lid"),
       grp([rect(CX, 196, 28, 34, 0), fill('#ffc83d')], "lidRibbon"),
       grp([ell(CX - 22, 168, 44, 30), fill('#ffc83d')], "bowL", tr(p=(CX - 22, 168), a=(CX - 22, 168), r=-20)),
       grp([ell(CX + 22, 168, 44, 30), fill('#ffc83d')], "bowR", tr(p=(CX + 22, 168), a=(CX + 22, 168), r=20)),
       grp([ell(CX, 172, 20, 20), fill('#e8a516')], "knot")]
layers.append(layer("lid", lid[::-1], ks(
    p=kf([(0, [CX, BASE, 0]), (46, [CX, BASE, 0]), (52, [CX, BASE + 10, 0]), (70, [CX + 70, BASE - 170, 0]), (90, [CX + 110, BASE - 120, 0])], (0.3, 1, 0.5, 0)),
    a=(CX, BASE),
    r=kf(shake + [(52, 0), (90, 50)]),
    o=kf([(0, 100), (76, 100), (92, 0)])), op=95))

# reward: round glasses on a glowing medal
glasses = [grp([ell(0, 0, 150, 150), fill('#fff6c8', 85)], "glow"),
           grp([ell(0, 0, 112, 112), fill('#ffd766'), stroke('#e0a400', 7)], "medal"),
           grp([ell(-22, 4, 36, 36), fill('#dff1ff'), stroke('#2f3a33', 6)], "lensL"),
           grp([ell(22, 4, 36, 36), fill('#dff1ff'), stroke('#2f3a33', 6)], "lensR"),
           grp([path([[-5, 2], [0, -3], [5, 2]], closed=False), stroke('#2f3a33', 5)], "bridge"),
           grp([path([[-30, -4], [-26, -8]], closed=False), stroke('#ffffff', 4)], "shineL")]
layers.append(layer("reward", glasses[::-1], ks(
    p=kf([(50, [CX, 250, 0]), (72, [CX, 128, 0]), (100, [CX, 138, 0]), (130, [CX, 128, 0])], (0.25, 1.4, 0.4, 0)),
    s=kf([(50, [20, 20, 100]), (72, [112, 112, 100]), (84, [100, 100, 100])], (0.3, 1.5, 0.4, 0)),
    r=kf([(50, -30), (74, 6), (90, 0)])), ip=50))

# sparkles around the reward
for i, (dx, dy, d) in enumerate([(-86, -40, 0), (84, -60, 6), (70, 40, 12), (-74, 34, 18)]):
    star = {"ty": "sr", "sy": 1, "d": 1, "pt": st(4), "p": st([0, 0]), "r": st(0), "ir": st(3), "is": st(0), "or": st(11), "os": st(0)}
    layers.append(layer(f"spark{i}", [grp([star, fill('#ffffff')])], ks(
        p=st([CX + dx, 128 + dy, 0]),
        s=kf([(72 + d, [0, 0, 100]), (82 + d, [130, 130, 100]), (96 + d, [0, 0, 100]), (110 + d, [100, 100, 100]), (124 + d, [0, 0, 100])])), ip=70))

# box body
body = [grp([rect(CX, 258, 150, 84, 12), fill('#ff7a9c')], "body"),
        grp([rect(CX - 52, 258, 26, 70, 6), fill('#ffffff', 22)], "shine"),
        grp([rect(CX, 258, 28, 84, 0), fill('#ffc83d')], "ribbon")]
layers.append(layer("box", body[::-1], ks(p=st([CX, BASE, 0]), a=(CX, BASE), r=kf(shake), s=squash)))

# rays behind
rays = [grp([path([[0, 0], [math.cos(a) * 165, math.sin(a) * 165], [math.cos(a + 0.12) * 165, math.sin(a + 0.12) * 165]]), fill('#ffe58f')], f"ray{k}")
        for k, a in enumerate([j * math.pi * 2 / 14 for j in range(14)])]
layers.append(layer("rays", rays, ks(
    p=st([CX, 128, 0]),
    s=kf([(48, [0, 0, 100]), (72, [100, 100, 100])], (0.3, 1, 0.4, 0)),
    r=kf([(48, 0), (OP, 70)], (0.5, 0.5, 0.5, 0.5)),
    o=kf([(48, 0), (66, 45), (OP, 35)])), ip=48))

# shadow
layers.append(layer("shadow", [grp([ell(CX, 306, 190, 22), fill('#2f3a33', 12)])], ks()))

anim = {"v": "5.7.4", "fr": FR, "ip": 0, "op": OP, "w": W, "h": H, "nm": "gift-levelup", "ddd": 0, "assets": [], "layers": layers}
out = os.path.join(os.path.dirname(__file__), 'gift-levelup.json')
json.dump(anim, open(out, 'w'), separators=(',', ':'))
print(out, os.path.getsize(out), 'bytes')
