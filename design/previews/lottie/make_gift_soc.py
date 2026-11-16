"""gift-soc.json: the level-up gift box, but Sóc pops out of it and a pair of glasses drops onto Sóc.
Sóc is converted from the real SVG (soc-idle.svg) into Lottie shape groups, so the drawing is identical.
Run: python make_gift_soc.py"""
import json, math, os, re
import xml.etree.ElementTree as ET
import make_gift as G  # reuses helpers and the box/lid/confetti layers

HERE = os.path.dirname(os.path.abspath(__file__))

# ---------- SVG -> Lottie shapes ----------
def num_list(s):
    return [float(x) for x in re.findall(r'-?\d*\.?\d+(?:e-?\d+)?', s)]


def parse_path(d):
    toks = re.findall(r'[MmLlCcQqZzHhVv]|-?\d*\.?\d+', d)
    subs, cur, pos, start, cmd, i = [], None, (0, 0), (0, 0), None, 0

    def num():
        nonlocal i
        v = float(toks[i]); i += 1; return v
    while i < len(toks):
        if re.match(r'[A-Za-z]', toks[i]):
            cmd = toks[i]; i += 1
            if cmd in 'Zz':
                if cur: cur['closed'] = True
                pos = start
                continue
        rel = cmd.islower(); C = cmd.upper()
        ox, oy = pos if rel else (0, 0)
        if C == 'M':
            x, y = num() + ox, num() + oy
            cur = {'v': [[x, y]], 'i': [[0, 0]], 'o': [[0, 0]], 'closed': False}; subs.append(cur)
            pos = start = (x, y); cmd = 'l' if rel else 'L'
        elif C == 'L':
            x, y = num() + ox, num() + oy
            cur['v'].append([x, y]); cur['i'].append([0, 0]); cur['o'].append([0, 0]); pos = (x, y)
        elif C == 'H':
            x = num() + ox; cur['v'].append([x, pos[1]]); cur['i'].append([0, 0]); cur['o'].append([0, 0]); pos = (x, pos[1])
        elif C == 'V':
            y = num() + oy; cur['v'].append([pos[0], y]); cur['i'].append([0, 0]); cur['o'].append([0, 0]); pos = (pos[0], y)
        elif C in 'CQ':
            if C == 'C':
                c1 = (num() + ox, num() + oy); c2 = (num() + ox, num() + oy); p = (num() + ox, num() + oy)
            else:
                q = (num() + ox, num() + oy); p = (num() + ox, num() + oy)
                c1 = (pos[0] + 2 / 3 * (q[0] - pos[0]), pos[1] + 2 / 3 * (q[1] - pos[1]))
                c2 = (p[0] + 2 / 3 * (q[0] - p[0]), p[1] + 2 / 3 * (q[1] - p[1]))
            cur['o'][-1] = [c1[0] - pos[0], c1[1] - pos[1]]
            cur['v'].append(list(p)); cur['i'].append([c2[0] - p[0], c2[1] - p[1]]); cur['o'].append([0, 0]); pos = p
    out = []
    for s in subs:
        v, ii, oo = s['v'], s['i'], s['o']
        if s['closed'] and len(v) > 1 and abs(v[0][0] - v[-1][0]) < 1e-6 and abs(v[0][1] - v[-1][1]) < 1e-6:
            ii[0] = ii[-1]; v, ii, oo = v[:-1], ii[:-1], oo[:-1]
        out.append({"ty": "sh", "ks": G.st({"i": ii, "o": oo, "v": v, "c": s['closed']})})
    return out


def color(c):
    if not c or c == 'none':
        return None, 1
    m = re.match(r'rgba?\(([^)]*)\)', c)
    if m:
        p = [float(x) for x in m.group(1).split(',')]
        return [p[0] / 255, p[1] / 255, p[2] / 255, 1], (p[3] if len(p) > 3 else 1)
    h = c.lstrip('#')
    if len(h) == 3: h = ''.join(ch * 2 for ch in h)
    return [int(h[k:k + 2], 16) / 255 for k in (0, 2, 4)] + [1], 1


def transform_groups(t):
    """SVG transform -> list of Lottie tr dicts (outermost first)."""
    trs = []
    for name, args in re.findall(r'(\w+)\(([^)]*)\)', t or ''):
        a = num_list(args)
        if name == 'translate':
            trs.append(G.tr(p=(a[0], a[1] if len(a) > 1 else 0)))
        elif name == 'rotate':
            cx, cy = (a[1], a[2]) if len(a) == 3 else (0, 0)
            trs.append(G.tr(p=(cx, cy), a=(cx, cy), r=a[0]))
        elif name == 'scale':
            s = a[0] * 100; trs.append(G.tr(s=(s, (a[1] if len(a) > 1 else a[0]) * 100)))
    return trs


ANIM = {}  # class -> function(element) returning an animated tr


def convert(el, inherited):
    tag = el.tag.split('}')[-1]
    style = dict(inherited)
    for k in ('fill', 'stroke', 'stroke-width', 'opacity', 'stroke-linecap'):
        if el.get(k) is not None:
            style[k] = el.get(k) if k != 'opacity' else float(el.get('opacity')) * inherited.get('opacity', 1)
    items = []
    if tag in ('g', 'svg'):
        kids = [convert(ch, {k: v for k, v in style.items() if k != 'opacity'} | {'opacity': style.get('opacity', 1)}) for ch in el]
        items = [k for k in kids if k][::-1]
        if not items: return None
        node = {"ty": "gr", "nm": el.get('class', 'g'), "it": items + [G.tr()]}
        cls = el.get('class')
        if cls in ANIM:
            node['it'][-1] = ANIM[cls](el)
    else:
        if tag == 'ellipse':
            geo = [G.ell(float(el.get('cx', 0)), float(el.get('cy', 0)), 2 * float(el.get('rx')), 2 * float(el.get('ry')))]
        elif tag == 'circle':
            r = float(el.get('r')); geo = [G.ell(float(el.get('cx', 0)), float(el.get('cy', 0)), 2 * r, 2 * r)]
        elif tag == 'rect':
            w, h = float(el.get('width')), float(el.get('height'))
            geo = [G.rect(float(el.get('x', 0)) + w / 2, float(el.get('y', 0)) + h / 2, w, h, float(el.get('rx', 0)))]
        elif tag == 'path':
            geo = parse_path(el.get('d'))
        else:
            return None
        paint = []
        op = style.get('opacity', 1)
        fc, fa = color(style.get('fill', '#000'))
        if fc: paint.append({"ty": "fl", "c": G.st(fc), "o": G.st(100 * fa * op), "r": 1})
        sc, sa = color(style.get('stroke'))
        if sc:
            paint.append({"ty": "st", "c": G.st(sc), "o": G.st(100 * sa * op), "w": G.st(float(style.get('stroke-width', 1))), "lc": 2, "lj": 2})
        node = {"ty": "gr", "nm": tag, "it": geo + paint + [G.tr()]}
    for t in reversed(transform_groups(el.get('transform'))):
        node = {"ty": "gr", "nm": "xf", "it": [node, t]}
    return node


def blink(el):
    e = el.find('{*}ellipse') if el.find('{*}ellipse') is not None else el.find('ellipse')
    cx, cy = float(e.get('cx')), float(e.get('cy'))
    t = G.tr(p=(cx, cy), a=(cx, cy))
    t['s'] = G.kf([(0, [100, 100]), (112, [100, 100]), (116, [100, 10]), (120, [100, 100]), (138, [100, 100]), (141, [100, 10]), (144, [100, 100])])
    return t


def ear(sign):
    def f(el):
        cx = 74 if sign < 0 else 146
        t = G.tr(p=(cx, 60), a=(cx, 60))
        t['r'] = G.kf([(0, 0), (70, 0), (78, 14 * sign), (86, -8 * sign), (94, 0)])
        return t
    return f


ANIM.update({'lid': blink, 'earL': ear(-1), 'earR': ear(1)})

svg = ET.parse(os.path.join(HERE, 'soc-idle.svg')).getroot()
for ch in list(svg):  # drop Sóc's own ground shadow; the box has one
    if (ch.get('class') or '') == 'shadow': svg.remove(ch)
soc_shapes = [convert(svg, {'fill': '#000', 'opacity': 1})]

# ---------- layers ----------
CX, BASE = G.CX, G.BASE
SOC_SCALE = 80
L = []
src = {l['nm']: l for l in G.layers}
for i in range(16): L.append(src[f'cf{i}'])
L.append(src['lid'])
for i in range(4):
    s = json.loads(json.dumps(src[f'spark{i}']))
    s['ks']['p'] = G.st([CX + [-96, 92, 96, -92][i], [110, 96, 190, 186][i], 0])
    L.append(s)

SOC_IND, GL_IND = 900, 901
glasses = [G.grp([G.path([[44, 100], [62, 108]], False), G.stroke('#2f3a33', 5)]),
           G.grp([G.path([[158, 108], [176, 100]], False), G.stroke('#2f3a33', 5)]),
           G.grp([G.path([[102, 112], [110, 106], [118, 112]], False), G.stroke('#2f3a33', 5)]),
           G.grp([G.ell(82, 113, 40, 40), G.fill('#b4dcff', 30), G.stroke('#2f3a33', 5)]),
           G.grp([G.ell(138, 113, 40, 40), G.fill('#b4dcff', 30), G.stroke('#2f3a33', 5)]),
           G.grp([G.path([[70, 104], [77, 98]], False), G.stroke('#ffffff', 3.5)])]
gl = G.layer('glasses', glasses[::-1], G.ks(
    p=G.kf([(84, [0, -260, 0]), (100, [0, 6, 0]), (106, [0, -8, 0]), (112, [0, 0, 0])], (0.3, 1, 0.5, 0)),
    r=G.kf([(84, -25), (100, 4), (112, 0)]), o=G.kf([(83, 0), (84, 100)])), ip=83)
gl['ind'] = GL_IND; gl['parent'] = SOC_IND
L.append(gl)

L.append(src['box'])

soc = G.layer('soc', soc_shapes, G.ks(
    p=G.kf([(50, [CX, 262, 0]), (108, [CX, 262, 0]), (112, [CX, 268, 0]), (118, [CX, 258, 0]), (126, [CX, 262, 0])]),
    a=(120, 250),
    s=G.kf([(50, [0, 0, 100]), (66, [SOC_SCALE * 1.15, SOC_SCALE * 1.15, 100]), (76, [SOC_SCALE, SOC_SCALE, 100]),
            (100, [SOC_SCALE, SOC_SCALE, 100]), (104, [SOC_SCALE * 1.06, SOC_SCALE * 0.92, 100]), (112, [SOC_SCALE, SOC_SCALE, 100])], (0.3, 1.4, 0.4, 0)),
    r=G.kf([(50, -12), (68, 6), (80, 0)])), ip=50)
soc['ind'] = SOC_IND
L.append(soc)
L.append(src['rays'])
L.append(src['shadow'])

anim = {"v": "5.7.4", "fr": G.FR, "ip": 0, "op": G.OP, "w": G.W, "h": G.H, "nm": "gift-soc", "ddd": 0, "assets": [], "layers": L}
out = os.path.join(HERE, 'gift-soc.json')
json.dump(anim, open(out, 'w'), separators=(',', ':'))
open(os.path.join(HERE, 'gift-soc-data.js'), 'w').write('window.GIFT=' + json.dumps(anim, separators=(',', ':')) + ';')
print(out, os.path.getsize(out), 'bytes')
