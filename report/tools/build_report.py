"""
Builds the Word report from the faculty template and the reviewed section drafts.

    pip install python-docx
    python report/tools/build_report.py            (run from the repository root)

Inputs
  BCSE302P_Mini_Project_Report_Template.docx   the template (cover, certificate, abstract, TOC are kept)
  report/sections/*.md                         the text, one file per section (edit these, then rebuild)
  report/team.json                             team name, members, registration numbers, date (see below)
  report/figures/fig_NN_*.png                  screenshots; a figure whose file is missing becomes a
                                               dashed "[ Insert screenshot ]" box, so the build can be
                                               repeated as the screenshots arrive
Output
  report/VaxTrack_Report.docx

After opening the file in Word: right-click the table of contents > Update Field > Update entire table,
then File > Save As > PDF. Nothing is invented: team details that are still empty stay as yellow
placeholders on the cover and the certificate.

team.json
  {"title": "", "members": [{"name": "", "reg": ""}], "submission_date": "dd / mm / 2026"}
  (title is optional; the default is the project title below)
"""
import copy
import json
import os
import re
import sys

import docx
from docx.shared import Inches
from lxml import etree

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
TEMPLATE = os.path.join(ROOT, 'BCSE302P_Mini_Project_Report_Template.docx')
SECTIONS = os.path.join(ROOT, 'report', 'sections')
FIGURES = os.path.join(ROOT, 'report', 'figures')
TEAM = os.path.join(ROOT, 'report', 'team.json')
OUT = os.path.join(ROOT, 'report', 'VaxTrack_Report.docx')
DEFAULT_TITLE = 'VaxTrack – Newborn Vaccination Schedule Tracker'

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
NS = {'w': W}
XML_SPACE = '{http://www.w3.org/XML/1998/namespace}space'


def q(tag):
    return '{%s}%s' % (W, tag)


def el(tag, attrs=None, children=()):
    e = etree.Element(q(tag))
    for k, v in (attrs or {}).items():
        e.set(q(k), str(v))
    for c in children:
        e.append(c)
    return e


# ------------------------------------------------------------------ runs and paragraphs
def run(text, bold=False, italic=False, size=24, code=False, color=None, highlight=False):
    font = 'Courier New' if code else 'Times New Roman'
    rpr = el('rPr')
    rpr.append(el('rFonts', {'ascii': font, 'cs': font, 'eastAsia': font, 'hAnsi': font}))
    if bold:
        rpr.append(el('b'))
        rpr.append(el('bCs'))
    if italic:
        rpr.append(el('i'))
        rpr.append(el('iCs'))
    if color:
        rpr.append(el('color', {'val': color}))
    sz = size - 2 if code else size
    rpr.append(el('sz', {'val': sz}))
    rpr.append(el('szCs', {'val': sz}))
    if highlight:
        rpr.append(el('highlight', {'val': 'yellow'}))
    r = el('r', children=[rpr])
    parts = text.split('\t')
    for i, part in enumerate(parts):
        if i:
            r.append(el('tab'))
        if part:
            t = el('t')
            t.text = part
            t.set(XML_SPACE, 'preserve')
            r.append(t)
    return r


INLINE = re.compile(r'(`[^`]+`|\*\*.+?\*\*|(?<![\w*])\*(?!\s)(?:.+?)(?<!\s)\*(?![\w*]))')


def inline_runs(text, size=24, bold=False, italic=False):
    """Markdown inline (`code`, **bold**, *italic*) to runs. A bold TODO is highlighted yellow."""
    text = re.sub(r'<!--.*?-->', '', text, flags=re.S).strip()
    runs = []
    for part in INLINE.split(text):
        if not part:
            continue
        if part.startswith('`') and part.endswith('`') and len(part) > 2:
            runs.append(run(part[1:-1], size=size, code=True, bold=bold, italic=italic))
        elif part.startswith('**') and part.endswith('**') and len(part) > 4:
            inner = part[2:-2]
            runs.append(run(inner, size=size, bold=True, italic=italic, highlight='TODO' in inner))
        elif part.startswith('*') and part.endswith('*') and len(part) > 2:
            runs.extend(inline_runs(part[1:-1], size=size, bold=bold, italic=True))
        else:
            runs.append(run(part, size=size, bold=bold, italic=italic))
    return runs


def para(runs, jc='both', after=120, line=360, before=None, style=None, extra=()):
    ppr = el('pPr')
    if style:
        ppr.append(el('pStyle', {'val': style}))
    for e in extra:
        ppr.append(e)
    sp = {'after': after, 'line': line}
    if before is not None:
        sp['before'] = before
    ppr.append(el('spacing', sp))
    if jc:
        ppr.append(el('jc', {'val': jc}))
    p = el('p', children=[ppr])
    for r in runs:
        p.append(r)
    return p


def heading(text, level):
    ppr = el('pPr')
    ppr.append(el('pStyle', {'val': 'Heading%d' % level}))
    if level == 1:
        ppr.append(el('pageBreakBefore'))
        ppr.append(el('spacing', {'after': 200, 'before': 120, 'line': 360}))
    else:
        ppr.append(el('keepNext'))
        ppr.append(el('spacing', {'after': 120, 'before': 200, 'line': 360}))
    p = el('p', children=[ppr])
    p.append(run(text, bold=True, size=28))
    return p


def bullet(text):
    ppr = el('pPr')
    ppr.append(el('pStyle', {'val': 'ListParagraph'}))
    ppr.append(el('numPr', children=[el('ilvl', {'val': 0}), el('numId', {'val': 2})]))
    ppr.append(el('spacing', {'after': 60, 'line': 360}))
    ppr.append(el('jc', {'val': 'both'}))
    p = el('p', children=[ppr])
    for r in inline_runs(text):
        p.append(r)
    return p


def numbered(n, text):
    ppr = el('pPr')
    ppr.append(el('pStyle', {'val': 'ListParagraph'}))
    ppr.append(el('spacing', {'after': 60, 'line': 360}))
    ppr.append(el('ind', {'left': 720, 'hanging': 360}))
    ppr.append(el('jc', {'val': 'both'}))
    p = el('p', children=[ppr])
    p.append(run('%s.\t' % n))
    for r in inline_runs(text):
        p.append(r)
    return p


def code_line(text):
    ppr = el('pPr')
    ppr.append(el('keepLines'))
    ppr.append(el('shd', {'fill': 'F2F2F2', 'color': 'auto', 'val': 'clear'}))
    ppr.append(el('spacing', {'after': 0, 'line': 252}))
    p = el('p', children=[ppr])
    p.append(run(text.replace('\t', '    '), size=20, code=True))
    return p


def spacer(after=120):
    return para([], after=after, line=240)


# ------------------------------------------------------------------ tables
BORDER = {'val': 'single', 'color': '000000', 'sz': 4}


def cell(text, width, header=False, size=22):
    tcpr = el('tcPr')
    tcpr.append(el('tcW', {'type': 'dxa', 'w': width}))
    tcpr.append(el('tcBorders', children=[el(s, BORDER) for s in ('top', 'left', 'bottom', 'right')]))
    if header:
        tcpr.append(el('shd', {'fill': 'D9E2F3', 'color': 'auto', 'val': 'clear'}))
    tcpr.append(el('tcMar', children=[el('top', {'type': 'dxa', 'w': 60}), el('left', {'type': 'dxa', 'w': 100}),
                                      el('bottom', {'type': 'dxa', 'w': 60}), el('right', {'type': 'dxa', 'w': 100})]))
    p = el('p', children=[el('pPr', children=[el('spacing', {'after': 0, 'line': 240})])])
    for r in inline_runs(text, size=size, bold=header):
        p.append(r)
    return el('tc', children=[tcpr, p])


def split_row(line):
    line = line.strip()
    if line.startswith('|'):
        line = line[1:]
    if line.endswith('|') and not line.endswith('\\|'):
        line = line[:-1]
    return [c.strip().replace('\\|', '|') for c in re.split(r'(?<!\\)\|', line)]


def table(lines):
    rows = [split_row(l) for l in lines if not re.match(r'^\|\s*:?-{2,}', l)]
    ncol = len(rows[0])
    rows = [(r + [''] * ncol)[:ncol] for r in rows]
    # column widths: every column is at least wide enough for its longest unbreakable word, the rest of
    # the width is shared by the length of the text (square-rooted so a long column does not squeeze the others)
    total = 9026
    size_for_width = 22 if ncol <= 3 else (20 if ncol == 4 else 17)
    per_char = size_for_width * 5.2          # twips per character, Times New Roman (average)
    minimum, weights = [], []
    for c in range(ncol):
        clean = [re.sub(r'[`*]', '', r[c]) for r in rows]
        longest_word = max(len(w) for t in clean for w in (t.split() or ['']))
        minimum.append(int(longest_word * per_char * 1.08 + 230))
        weights.append(max(6, min(max(len(t) for t in clean), 70)) ** 0.7)
    spare = max(total - sum(minimum), 0)
    widths = [m + int(spare * w / sum(weights)) for m, w in zip(minimum, weights)]
    scale = total / sum(widths)
    widths = [int(w * scale) for w in widths]
    widths[-1] += total - sum(widths)
    size = 22 if ncol <= 3 else (20 if ncol == 4 else 17)
    tblpr = el('tblPr', children=[
        el('tblW', {'type': 'dxa', 'w': total}),
        el('tblBorders', children=[el(s, {'val': 'single', 'color': 'auto', 'sz': 4})
                                   for s in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV')]),
        el('tblLayout', {'type': 'fixed'}),
    ])
    tbl = el('tbl', children=[tblpr, el('tblGrid', children=[el('gridCol', {'w': w}) for w in widths])])
    for i, r in enumerate(rows):
        trpr = el('trPr', children=[el('cantSplit')] + ([el('tblHeader')] if i == 0 else []))
        tr = el('tr', children=[trpr])
        for c, text in enumerate(r):
            tr.append(cell(text, widths[c], header=(i == 0), size=size))
        tbl.append(tr)
    return tbl


def placeholder_box(name):
    tcpr = el('tcPr')
    tcpr.append(el('tcW', {'type': 'dxa', 'w': 9026}))
    dashed = {'val': 'dashed', 'color': '999999', 'sz': 6}
    tcpr.append(el('tcBorders', children=[el(s, dashed) for s in ('top', 'left', 'bottom', 'right')]))
    tcpr.append(el('vAlign', {'val': 'center'}))
    p = para([run('[ Insert screenshot: %s ]' % name, italic=True, color='888888')], jc='center')
    tc = el('tc', children=[tcpr, p])
    tr = el('tr', children=[el('trPr', children=[el('trHeight', {'val': 2600, 'hRule': 'atLeast'})]), tc])
    tblpr = el('tblPr', children=[
        el('tblW', {'type': 'dxa', 'w': 9026}),
        el('tblBorders', children=[el(s, {'val': 'single', 'color': 'auto', 'sz': 4})
                                   for s in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV')]),
    ])
    return el('tbl', children=[tblpr, el('tblGrid', children=[el('gridCol', {'w': 9026})]), tr])


# ------------------------------------------------------------------ markdown blocks to document
class Builder:
    def __init__(self, document):
        self.doc = document
        self.sect = document.element.body.find(q('sectPr'))
        self.images = 0
        self.placeholders = []

    def add(self, e):
        self.sect.addprevious(e)

    def picture(self, name):
        path = os.path.join(FIGURES, name)
        if not os.path.exists(path):
            self.placeholders.append(name)
            self.add(placeholder_box(name))
            return
        p = self.doc.add_paragraph()           # python-docx appends before sectPr, like add()
        p.alignment = 1
        r = p.add_run()
        pic = r.add_picture(path, width=Inches(5.9))
        if pic.height > Inches(7.4):
            ratio = Inches(7.4) / pic.height
            pic.height = Inches(7.4)
            pic.width = int(pic.width * ratio)
        self.images += 1

    def render(self, md, skip_title=False):
        lines = md.splitlines()
        i = 0
        para_buf = []

        def flush():
            if para_buf:
                text = ' '.join(para_buf).strip()
                para_buf.clear()
                if text:
                    self.paragraph(text)

        while i < len(lines):
            line = lines[i]
            s = line.strip()
            if s.startswith('```'):
                flush()
                i += 1
                block = []
                while i < len(lines) and not lines[i].strip().startswith('```'):
                    block.append(lines[i].rstrip())
                    i += 1
                i += 1
                for b in block:
                    self.add(code_line(b))
                self.add(spacer())
                continue
            if s.startswith('|'):
                flush()
                tbl = []
                while i < len(lines) and lines[i].strip().startswith('|'):
                    tbl.append(lines[i])
                    i += 1
                self.add(table(tbl))
                self.add(spacer())
                continue
            m = re.match(r'^(#{1,3}) (.*)', s)
            if m:
                flush()
                level = len(m.group(1))
                if not (skip_title and level == 1):
                    self.add(heading(m.group(2).strip(), min(level, 2)))
                i += 1
                continue
            if not s or s.startswith('<!--'):
                flush()
                i += 1
                continue
            m = re.match(r'^- (.*)', s)
            if m:
                flush()
                self.add(bullet(m.group(1)))
                i += 1
                continue
            m = re.match(r'^(\d+)\. (.*)', s)
            if m:
                flush()
                self.add(numbered(m.group(1), m.group(2)))
                i += 1
                continue
            m = re.match(r'^\*\*\[ INSERT IMAGE: report/figures/(\S+) \]\*\*$', s)
            if m:
                flush()
                self.picture(m.group(1))
                i += 1
                continue
            para_buf.append(s)
            i += 1
        flush()

    def paragraph(self, text):
        m = re.match(r'^\*(Figure \d+\.\d+: .*)\*$', text)
        if m:
            self.add(para(inline_runs(m.group(1), size=22, italic=True), jc='center'))
            return
        m = re.match(r'^(Table \d+\.\d+: )(.*)$', text)
        if m:
            self.add(para([run(m.group(1), bold=True)] + inline_runs(m.group(2)), after=60, extra=(el('keepNext'),)))
            return
        self.add(para(inline_runs(text)))


# ------------------------------------------------------------------ template handling
def body_children(document):
    return list(document.element.body.iterchildren())


def text_of(e):
    return ''.join(t.text or '' for t in e.iter(q('t')))


def find(document, startswith):
    for e in body_children(document):
        if text_of(e).strip().startswith(startswith):
            return e
    raise KeyError(startswith)


def set_runs_text(p, text, keep_first_only=True):
    ts = list(p.iter(q('t')))
    ts[0].text = text
    for t in ts[1:]:
        t.text = ''


def highlight_runs(p):
    for r in p.iter(q('r')):
        rpr = r.find(q('rPr'))
        if rpr is not None and rpr.find(q('highlight')) is None:
            rpr.append(el('highlight', {'val': 'yellow'}))


def plain_runs(p):
    """remove the grey italic guidance look from a template paragraph that we fill in"""
    for r in p.iter(q('r')):
        rpr = r.find(q('rPr'))
        if rpr is None:
            continue
        for tag in ('i', 'iCs', 'color'):
            for x in rpr.findall(q(tag)):
                rpr.remove(x)


def fill_cover(document, team):
    title = team.get('title') or DEFAULT_TITLE
    members = [m for m in team.get('members', []) if m.get('name')]
    # titles
    for p in body_children(document):
        for t in p.iter(q('t')):
            if t.text and '<Project Title>' in t.text:
                t.text = t.text.replace('<Project Title>', title)
    # members table: first table in the document
    tbl = document.element.body.find(q('tbl'))
    rows = tbl.findall(q('tr'))[1:]
    if members:
        for idx, row in enumerate(rows):
            if idx >= len(members):
                tbl.remove(row)
                continue
            tcs = row.findall(q('tc'))
            for tc, val in zip(tcs, (str(idx + 1), members[idx]['name'], members[idx].get('reg', ''))):
                ts = list(tc.iter(q('t')))
                if ts:
                    ts[0].text = val
                    for t in ts[1:]:
                        t.text = ''
                else:
                    r = run(val, size=22)
                    tc.find(q('p')).append(r)
    else:
        for row in rows:
            for tc in row.findall(q('tc'))[1:]:
                p = tc.find(q('p'))
                if not text_of(p).strip():
                    p.append(run('<to be filled>', size=22))
                highlight_runs(p)
    try:
        guide = find(document, '(Maximum 4 members')
        guide.getparent().remove(guide)
    except KeyError:
        pass
    # certificate: the names run
    cert = find(document, 'This is to certify')
    names = ', '.join('%s (%s)' % (m['name'], m.get('reg') or 'Reg. No.') for m in members) if members else None
    for t in cert.iter(q('t')):
        if t.text and t.text.startswith('<Name 1'):
            if names:
                t.text = names
            else:
                t.text = '<Name 1 (Reg. No.)>, <Name 2 (Reg. No.)>, <Name 3 (Reg. No.)>, <Name 4 (Reg. No.)>'
                rpr = t.getparent().find(q('rPr'))
                if rpr is not None:
                    rpr.append(el('highlight', {'val': 'yellow'}))
    # dates
    date = team.get('submission_date')
    d1 = find(document, 'Date of Submission')
    if date:
        set_runs_text(d1, 'Date of Submission: %s' % date)
        set_runs_text(find(document, 'Date:'), 'Date: %s' % date)
    else:
        highlight_runs(d1)
    return bool(members), bool(date)


def fill_abstract(document, md):
    paras = [l.strip() for l in md.splitlines() if l.strip() and not l.startswith('#')]
    abstract = next(l for l in paras if not l.startswith('**Keywords'))
    keywords = next(l for l in paras if l.startswith('**Keywords')).split(':**', 1)[1].strip()
    guide = find(document, 'Write 150')
    plain_runs(guide)
    set_runs_text(guide, abstract)
    kw = find(document, 'Keywords:')
    ts = list(kw.iter(q('t')))
    ts[1].text = keywords
    plain_runs(kw)
    toc_guide = find(document, '(Right-click here')
    toc_guide.getparent().remove(toc_guide)


def main():
    team = {}
    if os.path.exists(TEAM):
        team = json.load(open(TEAM, encoding='utf-8'))
    document = docx.Document(TEMPLATE)
    members_ok, date_ok = fill_cover(document, team)
    fill_abstract(document, open(os.path.join(SECTIONS, '00_abstract.md'), encoding='utf-8').read())

    # drop the template's own chapters (everything from "1. INTRODUCTION"), keep the closing sectPr
    start = find(document, '1. INTRODUCTION')
    started = False
    for e in body_children(document):
        if e is start:
            started = True
        if started and e.tag != q('sectPr'):
            e.getparent().remove(e)

    b = Builder(document)
    for name in sorted(os.listdir(SECTIONS)):
        if not re.match(r'^\d\d_.*\.md$', name) or name.startswith('00_'):
            continue
        b.render(open(os.path.join(SECTIONS, name), encoding='utf-8').read())

    cp = document.core_properties
    cp.title = team.get('title') or DEFAULT_TITLE
    cp.subject = 'BCSE302P Database Systems Laboratory, Mini Project Report'
    document.save(OUT)
    print('written', OUT)
    print('pictures embedded:', b.images, '| placeholders left:', len(b.placeholders))
    print('team members filled:', members_ok, '| submission date filled:', date_ok)


if __name__ == '__main__':
    sys.exit(main())
