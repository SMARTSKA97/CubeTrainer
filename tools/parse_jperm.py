import sys, re, json, os, glob, base64
from html.parser import HTMLParser

class P(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows=[]; self.cur=None; self.stack=[]; self.field=None; self.depth_row=None
    def handle_starttag(self,tag,attrs):
        a=dict(attrs); cls=(a.get("class") or "").split()
        if tag=="div":
            self.stack.append(cls)
            if cls and cls[0]=="tr" and self.cur is None:
                self.cur={"rowclass":" ".join(cls),"name":"","group":"","alg":"","img":None}
                self.depth_row=len(self.stack)
            elif self.cur is not None and "td" in cls:
                for f in ("name","group","alg","img","best","avg"):
                    if f in cls: self.field=f
            elif self.cur is not None and "td-text" in cls and self.field in ("name","group","alg"):
                self.capture=self.field
        if tag=="img" and self.cur is not None and self.field=="img":
            src=a.get("src","")
            if src.startswith("data:image") and self.cur["img"] is None:
                self.cur["img"]=src
    def handle_endtag(self,tag):
        if tag=="div":
            if self.stack: self.stack.pop()
            if self.cur is not None and self.depth_row is not None and len(self.stack)<self.depth_row:
                self.rows.append(self.cur); self.cur=None; self.depth_row=None; self.field=None
            if getattr(self,"capture",None): self.capture=None
    def handle_data(self,d):
        c=getattr(self,"capture",None)
        if c and self.cur is not None:
            self.cur[c]+=d

def parse(path):
    p=P(); p.feed(open(path,encoding="utf-8",errors="replace").read())
    out=[]
    for r in p.rows:
        out.append({k:(v.strip() if isinstance(v,str) and k!="img" else v) for k,v in r.items()})
    return out

if __name__=="__main__":
    d=sys.argv[1]
    for f in sorted(glob.glob(os.path.join(d,"*.html"))):
        rows=parse(f)
        print("==",os.path.basename(f),len(rows))
        for r in rows[:3]:
            print("  ",r["rowclass"],"|",r["name"],"|",r["group"],"|",r["alg"],"|",bool(r["img"]))
