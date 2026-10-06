import sys, json, os, re, base64
sys.path.insert(0, os.path.dirname(__file__))
from parse_jperm import parse

SRC=sys.argv[1]; OUT=sys.argv[2]
SETS=[
 ("2lookoll","2-Look OLL","Algorithms_ 2-Look OLL.html","oll"),
 ("2lookpll","2-Look PLL","Algorithms_ 2-Look PLL.html","pll"),
 ("oll","Full OLL","Algorithms_ 3x3 OLL.html","oll"),
 ("pll","Full PLL","Algorithms_ 3x3 PLL.html","pll"),
 ("coll","COLL","Algorithms_ COLL.html","coll"),
 ("wv","Winter Variation","Algorithms_ Winter Variation.html","wv"),
 ("oholl","One-Handed OLL","Algorithms_ One-Handed OLL.html","oll"),
 ("ohpll","One-Handed PLL","Algorithms_ 3x3 One-Handed PLL.html","pll"),
]
os.makedirs(os.path.join(OUT,"img"),exist_ok=True)
sets=[]; cases=[]
for sid,label,fn,kind in SETS:
    rows=[r for r in parse(os.path.join(SRC,fn)) if r["alg"]]
    sets.append({"id":sid,"label":label,"kind":kind,"count":len(rows)})
    for i,r in enumerate(rows):
        name=r["name"]; group=r["group"]
        # OLL pages have "number | name | alg" layout: first cell is number, second is name shown in group column
        if sid in ("oll","oholl"):
            num=name; name=f"OLL {num} – {group}"; group=group
        cid=f"{sid}-{i+1:02d}"
        imgfile=None
        if r["img"]:
            m=re.match(r"data:image/(\w+);base64,(.*)",r["img"],re.S)
            if m:
                imgfile=f"img/{cid}.{m.group(1)}"
                open(os.path.join(OUT,imgfile),"wb").write(base64.b64decode(m.group(2)))
        cases.append({"id":cid,"set":sid,"name":name,"group":group,"alg":re.sub(r"\s+"," ",r["alg"]).strip(),"img":imgfile})
from collections import Counter, defaultdict
for sid in {c["set"] for c in cases}:
    cnt=Counter(c["name"] for c in cases if c["set"]==sid)
    seen=defaultdict(int)
    for c in cases:
        if c["set"]==sid and cnt[c["name"]]>1:
            seen[c["name"]]+=1
            c["name"]=f'{c["name"]} {seen[c["name"]]}'
json.dump({"sets":sets,"cases":cases},open(os.path.join(OUT,"algs.json"),"w"),indent=1,ensure_ascii=False)
for s in sets: print(s)
print(len(cases),"cases")
