/** 洛克王国世界精灵图鉴赛季异色数据。
 *  来源：wiki.biligame.com/nrc 精灵图鉴
 *  条件：归属赛季 + 有异色 + 进化位置为初始
 *  图片：页面 .npc-art-shiny 节点中的异色立绘
 *  更新时间：2026-10-22
 */
const SEASON_META = {
  "S1": {
    "name": "暗夜拾光",
    "accent": "#5d8a49",
    "accent2": "#96b85d"
  },
  "S2": {
    "name": "狂欢怪谈",
    "accent": "#b24b68",
    "accent2": "#e7985d"
  },
  "S3": {
    "name": "铅字幻梦",
    "accent": "#517fa5",
    "accent2": "#8ba8c1"
  },
  "S4": {
    "name": "月涌狂想",
    "accent": "#7453a0",
    "accent2": "#b17bc7"
  }
}

const SEASON_PETS = {
  "S1": [
    {
      "number": "041",
      "name": "奇丽草",
      "types": [
        "草"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/f/f3/iqa556gjsubvewtlney41dr599tj128.png"
    },
    {
      "number": "131",
      "name": "恶魔狼",
      "types": [
        "恶"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/c/c5/gj61gicaywylz26cbh044dvve0tpm25.png"
    },
    {
      "number": "137",
      "name": "呼呼猪",
      "types": [
        "冰",
        "地"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/1/1d/apo56anommg5zejprgvbc9qzmbnaew1.png"
    },
    {
      "number": "142",
      "name": "大耳帽兜",
      "types": [
        "冰",
        "萌"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/f/fc/64u30xbj9xtyr3ap2x5ekety72bw5c3.png"
    },
    {
      "number": "205",
      "name": "拉特",
      "types": [
        "电"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/b/bf/sc574tpesiosb5mzt21my7p44zgt5za.png"
    },
    {
      "number": "255",
      "name": "治愈兔",
      "types": [
        "火",
        "萌"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/2/24/4iudcarlwfapinyacc95v72ohfzewwl.png"
    },
    {
      "number": "263",
      "name": "机械方方",
      "types": [
        "机械"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/2/2f/iut17f87qc413wg65nh43op0nysd43d.png"
    },
    {
      "number": "274",
      "name": "格兰种子",
      "types": [
        "草"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/c/cc/rlfk25g4ysvn852ifkhyqq7xe4qj5qy.png"
    },
    {
      "number": "293",
      "name": "小帕尔",
      "types": [
        "恶"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/1/10/bip650acoa8zvt7zzqya8bj6dpge047.png"
    },
    {
      "number": "307",
      "name": "绒绒",
      "types": [
        "光",
        "虫"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/1/1c/0dunful89whtkpq7hs7mdklenzgpb9x.png"
    },
    {
      "number": "310",
      "name": "犀角鸟",
      "types": [
        "光"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/3/35/ilbouk69v7npjpyigwf52ycb5gvh4yp.png"
    },
    {
      "number": "320",
      "name": "双灯鱼",
      "types": [
        "水",
        "电"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/3/34/tct39fz8s9ubf8m1v42k2n80rnasplk.png"
    },
    {
      "number": "322",
      "name": "月牙雪熊",
      "types": [
        "冰",
        "幻"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/d/d2/aoydyblb7m3eumwhunfvp4cmg7soujq.png"
    },
    {
      "number": "323",
      "name": "嗜光嗡嗡",
      "types": [
        "恶",
        "光"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/c/c1/lov3qt0q7b4gkk4c9ot8ik96nqy4qr7.png"
    },
    {
      "number": "325",
      "name": "柴渣虫",
      "types": [
        "火",
        "草"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/5/54/byc6b6re5a9u04g9om7l153z2x26k85.png"
    },
    {
      "number": "327",
      "name": "空空颅",
      "types": [
        "幽"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/e/e2/642q3i7wjxq2de460ozbxi5u844uyzm.png"
    },
    {
      "number": "330",
      "name": "粉粉星",
      "types": [
        "电",
        "幻"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/5/5c/3dwabudh9fvj9ezbwofri1taiwja1r9.png"
    },
    {
      "number": "332",
      "name": "贝瑟",
      "types": [
        "机械",
        "火"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/9/9f/1wk194qg2fixe9cqlwjd98340ubsepr.png"
    },
    {
      "number": "335",
      "name": "粉星仔",
      "types": [
        "幻"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/c/c7/aqv8emt8qx7rd7flvp7ihrq35m4xpq2.png"
    }
  ],
  "S2": [
    {
      "number": "030",
      "name": "恶魔叮",
      "types": [
        "恶",
        "翼"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/e/e6/moe9yn9ow76awen2s4d785vit74nm7o.png"
    },
    {
      "number": "035",
      "name": "幽影树",
      "types": [
        "幽",
        "草"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/2/2e/1gi1oqq4jmbs9g4n0hhpcwzsezivada.png"
    },
    {
      "number": "052",
      "name": "嘟嘟煲",
      "types": [
        "毒"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/c/c6/lo14f7bqqowxhyrecuzyop9glzy0qop.png"
    },
    {
      "number": "079",
      "name": "菊花梨",
      "types": [
        "萌"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/0/0d/leqs2335p25x8d63yi5r8wsj19oax1d.png"
    },
    {
      "number": "085",
      "name": "小夜",
      "types": [
        "恶"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/9/9c/ej7natpxsnf5ltbw1hgg2m904gizzdc.png"
    },
    {
      "number": "116",
      "name": "小独角兽",
      "types": [
        "光"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/1/18/5b8mm7wewfq8xi0i99vm2gsmb3q6ra1.png"
    },
    {
      "number": "147",
      "name": "灵狐",
      "types": [
        "火",
        "冰"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/b/bf/b44r17f5qco2ke86560exnmgm5hhdum.png"
    },
    {
      "number": "162",
      "name": "公平鸽",
      "types": [
        "普通"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/e/e5/5s9j5ys5afik9o9wdxf2hifkme1zq1q.png"
    },
    {
      "number": "354",
      "name": "小雪人",
      "types": [
        "冰"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/b/b7/g2kv0ab7ua2d8bwlzdjrmlyqrhe9uoe.png"
    },
    {
      "number": "356",
      "name": "爆焰仔",
      "types": [
        "火",
        "龙"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/2/2c/qpyxsndxy2p5qwm49wrz1hsqm5fldz1.png"
    },
    {
      "number": "358",
      "name": "猴麦仔",
      "types": [
        "普通",
        "机械"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/4/48/4ztj7jekqpamdglvzyvexp9buebfj8p.png"
    },
    {
      "number": "360",
      "name": "加油海葵",
      "types": [
        "水",
        "萌"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/a/a3/pidwtzupkcre4hhv636rgkuljndqrcl.png"
    },
    {
      "number": "362",
      "name": "小丑豆豆",
      "types": [
        "恶"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/8/8d/4gj09b030ie2kmrakj20i20nv3binad.png"
    },
    {
      "number": "365",
      "name": "烟花团",
      "types": [
        "火",
        "毒"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/f/f2/8lplwipspmew3eca9epsha6c67ys4x2.png"
    },
    {
      "number": "367",
      "name": "咕咕帽",
      "types": [
        "幽"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/3/3d/0tncrfdf42cqjnytjsorj69xylhgz12.png"
    },
    {
      "number": "369",
      "name": "炫光迪迪",
      "types": [
        "电",
        "光"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/3/38/74nvevjry2m4ni157xi23yb5cxsb3ie.png"
    },
    {
      "number": "371",
      "name": "小鼓象",
      "types": [
        "机械"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/f/fd/3w9gjmfnr0ejlz6vxqj0j0zysx9eumi.png"
    },
    {
      "number": "373",
      "name": "牵线木偶",
      "types": [
        "幻"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/5/55/l2n3q2n1djoiza7yis9lgcmp5q4qdun.png"
    }
  ],
  "S3": [
    {
      "number": "071",
      "name": "伊贝儿",
      "types": [
        "草"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/3/30/pzj1vz0wfaxi7ytb32fvrny2616mf02.png"
    },
    {
      "number": "076",
      "name": "海盔虫",
      "types": [
        "水",
        "毒"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/4/4d/2cl8shd484n5ftpe03ajsq0agkwp23n.png"
    },
    {
      "number": "076",
      "name": "海盔虫（磨损的样子）",
      "types": [
        "水",
        "毒"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/a/ad/klsdfuy2l3jzj3s49hmtfi0rlrzivsg.png"
    },
    {
      "number": "099",
      "name": "小草虫",
      "types": [
        "虫",
        "草"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/2/25/mfwj6ab0te3y6vjob0f00b8o0hyozyd.png"
    },
    {
      "number": "177",
      "name": "斑斑",
      "types": [
        "翼"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/e/e3/noo0grtjzdh9gfjrvfmbb97teug9vbl.png"
    },
    {
      "number": "231",
      "name": "小鹬",
      "types": [
        "翼"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/a/aa/dj032cmsnx41dui846jgnusx4s5l5yp.png"
    },
    {
      "number": "239",
      "name": "豆丁鱼",
      "types": [
        "水",
        "龙"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/e/e6/dusg0gckippb6h07hepk30dg0jht18g.png"
    },
    {
      "number": "266",
      "name": "可立鸡",
      "types": [
        "火"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/0/0f/h1t72myof5m3f62ai9vtq7kodgp3oiw.png"
    },
    {
      "number": "277",
      "name": "地鼠（枯水期的样子）",
      "types": [
        "地"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/e/e1/dl9qenf60rk3fc4x87qt2tfl0el4skp.png"
    },
    {
      "number": "277",
      "name": "地鼠（储水时的样子）",
      "types": [
        "地"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/9/9b/5548zlyxe9bbil9suj0mu58ybhnq7do.png"
    },
    {
      "number": "418",
      "name": "咬咬小子",
      "types": [
        "机械"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/2/2b/bbsulrsdcf9hy22gqqyvoa5vzn1jrhg.png"
    },
    {
      "number": "420",
      "name": "足尖元件",
      "types": [
        "幻",
        "机械"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/6/62/oqvub8vndhxmhq5ioau40p0mn7jm2yp.png"
    },
    {
      "number": "422",
      "name": "蝴蝶陶陶",
      "types": [
        "萌"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/5/5b/4cw7f4qombmrr687n9j3uvsq95vcfkk.png"
    },
    {
      "number": "425",
      "name": "苞米仔",
      "types": [
        "草",
        "火"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/f/f7/bsx21mpx6gl0isgkgm5m415sy6xs8g0.png"
    },
    {
      "number": "427",
      "name": "十字蝌蚪",
      "types": [
        "水"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/d/db/hrtwg69guotoe15e2oftwem1rrdeter.png"
    },
    {
      "number": "430",
      "name": "卡波",
      "types": [
        "恶"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/8/87/bmtmn8j1bvgf9ybjakwukz80e0uafa4.png"
    },
    {
      "number": "432",
      "name": "守夜烛",
      "types": [
        "火",
        "光"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/9/9e/h8fooljsqytjg0t453hiaqorbib1pc5.png"
    },
    {
      "number": "434",
      "name": "蜜果骸",
      "types": [
        "幽",
        "草"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/2/21/not72rwb1qaph1oxr926jfdsigyjq6w.png"
    },
    {
      "number": "436",
      "name": "稻草人",
      "types": [
        "萌",
        "武"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/5/58/t78thdbol8c6shgx6u5i4j4rlxxtp6o.png"
    },
    {
      "number": "438",
      "name": "栗鼠",
      "types": [
        "毒",
        "普通"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/f/f3/5c14g272yhxowdwlwwdc588fw74mkju.png"
    }
  ],
  "S4": [
    {
      "number": "021",
      "name": "小灵菇",
      "types": [
        "幽"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/0/06/70ljrkl0xbh69svcx9gh3j0x9kss8fb.png"
    },
    {
      "number": "121",
      "name": "小黑猫",
      "types": [
        "普通"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/5/51/jad5gld5mmf4xjadn03t2yitutso2n8.png"
    },
    {
      "number": "198",
      "name": "逗逗",
      "types": [
        "萌"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/e/ef/euody9he6j3g42zzd7j143sa8vltzp6.png"
    },
    {
      "number": "237",
      "name": "刺轮砣（上弦的样子）",
      "types": [
        "毒",
        "萌"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/7/76/othvucthqxkkq3xnqc772pz1fglui9w.png"
    },
    {
      "number": "237",
      "name": "刺轮砣（下弦的样子）",
      "types": [
        "毒",
        "萌"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/8/87/frgw0aidjj50rzk7h1rhdd2oe7kna3t.png"
    },
    {
      "number": "379",
      "name": "叮叮卯",
      "types": [
        "机械",
        "虫"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/a/a6/geb6fk1qtwxo1s65spd86dmu20fhaf3.png"
    },
    {
      "number": "400",
      "name": "瑰眼仔",
      "types": [
        "恶",
        "虫"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/4/44/kyrrgi08lswtcuo8995xeptpccuuqdg.png"
    },
    {
      "number": "403",
      "name": "觅觅蝠",
      "types": [
        "翼"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/d/de/5fcxfjx0bqhut12s5zz8gter7xypzox.png"
    },
    {
      "number": "406",
      "name": "芽眼魔",
      "types": [
        "恶",
        "水"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/2/26/aud9rusa2rj8r3aeu6rsqcwrn8521mb.png"
    },
    {
      "number": "446",
      "name": "新月鹭",
      "types": [
        "翼",
        "冰"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/f/f6/5l8dm7dn1ogbe40020ks9w8zeb0wddr.png"
    },
    {
      "number": "449",
      "name": "热团团",
      "types": [
        "火",
        "虫"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/9/9b/or4tl23t9qpg1hj3tt7cgo0ytnsgxz0.png"
    },
    {
      "number": "452",
      "name": "章脑丸",
      "types": [
        "光",
        "水"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/d/db/ai4ayri5g9x11z9qlc0dpeaddeppa5z.png"
    },
    {
      "number": "454",
      "name": "未完虫",
      "types": [
        "幽",
        "虫"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/b/ba/lccwgrwk66ymstzb9hwssv5144mdwq2.png"
    },
    {
      "number": "455",
      "name": "玳龟",
      "types": [
        "幻"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/8/8d/mxggimb0vjhp16pngg01befa9j19xqm.png"
    },
    {
      "number": "457",
      "name": "量风碗",
      "types": [
        "翼",
        "机械"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/3/3f/0bc80ghrtn3mereqmrunjfejav74z1w.png"
    },
    {
      "number": "459",
      "name": "小浣蛋",
      "types": [
        "恶"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/8/80/lvg8j9c08xqlt9jwntrwfvg98cljq7u.png"
    },
    {
      "number": "461",
      "name": "幽铃",
      "types": [
        "幽"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/f/f2/6h89aqficuaoybfzkkqqgs8fvopzcim.png"
    },
    {
      "number": "463",
      "name": "星星眼",
      "types": [
        "幻"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/5/58/k59mof746mtnxxmo7d9detlwzv5ov3z.png"
    },
    {
      "number": "464",
      "name": "布灵",
      "types": [
        "幻",
        "光"
      ],
      "img": "https://patchwiki.biligame.com/images/nrc/5/54/a6fr7aw7g66bjzzd35w2anwmyq9co76.png"
    }
  ]
}

export const SEASONS = Object.keys(SEASON_PETS)

export function getSeasonData(key) {
  const id = String(key || '').toUpperCase()
  if (!Object.prototype.hasOwnProperty.call(SEASON_PETS, id)) return null
  return { id, ...SEASON_META[id], pets: SEASON_PETS[id] }
}
