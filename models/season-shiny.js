/** 洛克王国世界精灵图鉴赛季数据。来源：wiki.biligame.com/nrc 精灵图鉴，条件：归属赛季 + 有异色 + 进化位置为初始，更新时间：2026-10-22 */
const SEASON_META = {
  S1: { name: '暗夜拾光', accent: '#5d8a49', accent2: '#96b85d' },
  S2: { name: '狂欢怪谈', accent: '#b24b68', accent2: '#e7985d' },
  S3: { name: '铅字幻梦', accent: '#517fa5', accent2: '#8ba8c1' },
  S4: { name: '月涌狂想', accent: '#7453a0', accent2: '#b17bc7' }
}

const img = {
  qilicao: 'https://patchwiki.biligame.com/images/nrc/5/5f/3tt9dtizbxrxfhr2nei2089h5blj871.png',
  emolong: 'https://patchwiki.biligame.com/images/nrc/4/41/o9vwhwwjbk20z09kivara197vk6048l.png',
  huhuzhu: 'https://patchwiki.biligame.com/images/nrc/b/b6/g57shy2n05mra21af1vtx0h8eob0yd5.png',
  daermaodou: 'https://patchwiki.biligame.com/images/nrc/b/ba/klinkws8190nmwndg1wrspeqb4b949n.png',
  late: 'https://patchwiki.biligame.com/images/nrc/f/f6/6h1bovno1a2tmhqnrxa9tn4td4wn00k.png',
  zhiyutu: 'https://patchwiki.biligame.com/images/nrc/8/8a/li7gutlhykp2d2wcx2ha8g37zxfwrhu.png',
  jixiefangfang: 'https://patchwiki.biligame.com/images/nrc/6/64/hyr458nx3m1yownaa85oww9u1luwt5m.png',
  gelan: 'https://patchwiki.biligame.com/images/nrc/c/c8/si34vtu013kktmb0f70hhwfm41uvovo.png',
  xiaopar: 'https://patchwiki.biligame.com/images/nrc/b/b0/fubtygthvvqf964m00buny7f5gmouwk.png',
  rongrong: 'https://patchwiki.biligame.com/images/nrc/a/af/d7i2lwvkqjt788rtgdj9cky9s3s8dxt.png',
  xijiaoniao: 'https://patchwiki.biligame.com/images/nrc/e/eb/0ese7dtcq6y2fo598svu05hmm3ysr87.png',
  shuangdengyu: 'https://patchwiki.biligame.com/images/nrc/c/c1/tapc4hswjpm5cdune68buxyj30je92n.png',
  yueyaxuexiong: 'https://patchwiki.biligame.com/images/nrc/c/cf/81jbsb2wkf4z17ttcfte2pl10b23vha.png',
  shiguangwengweng: 'https://patchwiki.biligame.com/images/nrc/1/1d/em4f4pprx53d6fzppr18ijn2z7w63gn.png',
  chaizhachong: 'https://patchwiki.biligame.com/images/nrc/c/c2/b33xd59g9hynfhzqypqb7n73upzbsws.png',
  kongkonglu: 'https://patchwiki.biligame.com/images/nrc/4/4b/tg68mufeuuqf5eueii3wit8uhtfdfuq.png',
  fenfenxing: 'https://patchwiki.biligame.com/images/nrc/0/01/l7j7ty6motoufqui4ktcmgt3ftrtbfg.png',
  beise: 'https://patchwiki.biligame.com/images/nrc/8/8f/h7qa3t8jfjoje1tuizjprna1mcdts3v.png',
  fenxingzai: 'https://patchwiki.biligame.com/images/nrc/d/d9/5ye8dwjverbalz68zmb0agjnithzec0.png',
  emoding: 'https://patchwiki.biligame.com/images/nrc/f/fc/tpkxcqs46x0zip6woqw0pkkwsoazksy.png',
  youyingshu: 'https://patchwiki.biligame.com/images/nrc/6/66/8fg9s5c1ttuzfxnahc1n14ilqdjbpbs.png',
  dudubao: 'https://patchwiki.biligame.com/images/nrc/7/77/mpfwm73nk52jar2t9xls8at0iemzzvn.png',
  juhuali: 'https://patchwiki.biligame.com/images/nrc/1/10/esq7kbzx50enk64w15cso64oif57pxg.png',
  xiaoye: 'https://patchwiki.biligame.com/images/nrc/7/73/fflx3l7yxim9y0gvoo50335utv7py3u.png',
  xiaodushoujiao: 'https://patchwiki.biligame.com/images/nrc/6/61/o5dkkzgy6234f69ilyxw66qb0d3e3mq.png',
  linghu: 'https://patchwiki.biligame.com/images/nrc/7/7f/8xhafzs8vrlgc00w9j484vhhnlruy12.png',
  gongpingge: 'https://patchwiki.biligame.com/images/nrc/b/bd/diykb6s9r94d9cir0jpi2ilm0wpjmk9.png',
  xiaoxueren: 'https://patchwiki.biligame.com/images/nrc/5/5f/hfca1270ptsx6t80rercf4g9ar9j1kr.png',
  baoyanzai: 'https://patchwiki.biligame.com/images/nrc/9/9b/3v7m516xnl932m5mtl8w5bliea5zyr7.png',
  houmaizai: 'https://patchwiki.biligame.com/images/nrc/9/9a/4xogxbmzga9hyjpv580a96buo8uetxr.png',
  jiayouhaikui: 'https://patchwiki.biligame.com/images/nrc/6/60/iacvuuyjf6ukf4x42yr9vo2czd8tjn4.png',
  xiachoudoudou: 'https://patchwiki.biligame.com/images/nrc/8/8c/73ceu27gmrqb07gmt07yhyxwqyh7kux.png',
  yanhuatuan: 'https://patchwiki.biligame.com/images/nrc/9/90/qr4n81x6ti4m1xto31sdyi3km9k55oz.png',
  gugumao: 'https://patchwiki.biligame.com/images/nrc/7/7a/5t662h1y51uwhrik7q73292gpwmdi4w.png',
  xuanguangdidi: 'https://patchwiki.biligame.com/images/nrc/1/14/8uyjdb8x5svzs1x8sbe9fra0g983dp4.png',
  xiaoguxiang: 'https://patchwiki.biligame.com/images/nrc/2/2f/deedrb9b1fse706kbxcm60wn4iyf3fr.png',
  qianxianmuou: 'https://patchwiki.biligame.com/images/nrc/6/68/nznhjgw4qze7w04u99sksiriczzvrmy.png',
  yibeier: 'https://patchwiki.biligame.com/images/nrc/4/47/gdw2gokqtc5oeewfv1o61g252bcq02b.png',
  haikuichong: 'https://patchwiki.biligame.com/images/nrc/8/89/bv2ajvk9vjzyhv88az60s440du6x306.png',
  haikuichongWorn: 'https://patchwiki.biligame.com/images/nrc/8/88/bvmo493pe27oik9yw4bdkxt02ttzqey.png',
  xiaocaochong: 'https://patchwiki.biligame.com/images/nrc/5/51/ebddividnygfai0h3p3p4hrsadyp3t6.png',
  banban: 'https://patchwiki.biligame.com/images/nrc/f/f3/llxvnb0ydt6g4mqqgops0cpr1elht87.png',
  xiaoyu: 'https://patchwiki.biligame.com/images/nrc/1/1d/6k6cdi8x9bsgkxh5u2kqhv5qduo93ql.png',
  doudingyu: 'https://patchwiki.biligame.com/images/nrc/d/d4/4i8n979fy5sk9o42ny9zpiy85in5c74.png',
  keliji: 'https://patchwiki.biligame.com/images/nrc/6/6a/p8nremm6dcf3icm8ej73pupa9bviz8q.png',
  dishuDry: 'https://patchwiki.biligame.com/images/nrc/6/65/j8tyzwjl27uswtbeao9n8nmy4gkpxmo.png',
  dishuWater: 'https://patchwiki.biligame.com/images/nrc/a/a8/k0lbhzk74uexk54xqc30vo6grbnox5q.png',
  yaoyaxiaozi: 'https://patchwiki.biligame.com/images/nrc/b/b1/tqb7qs3hu5znwclpt9kig6neaqngblf.png',
  zujianyuanjian: 'https://patchwiki.biligame.com/images/nrc/4/4b/4v123hyopzvgflc6jwp6upepjxpbgjq.png',
  huditaotao: 'https://patchwiki.biligame.com/images/nrc/1/1c/kuz5kuhz7j55vgdcxlt2v63plzywqlg.png',
  baomizai: 'https://patchwiki.biligame.com/images/nrc/9/93/t8ae28yuxqdt4hxy7htyhry8n1m58po.png',
  shizikedou: 'https://patchwiki.biligame.com/images/nrc/e/ea/qot32iidqmkjir5fullxyjfpif9obeq.png',
  kabuo: 'https://patchwiki.biligame.com/images/nrc/7/7b/or74abjwtso6swwxqpjush2w4al5bk2.png',
  shouyezhu: 'https://patchwiki.biligame.com/images/nrc/7/79/nzvat9fgf3wh8961jlcqaed8t437qjs.png',
  miguo: 'https://patchwiki.biligame.com/images/nrc/9/9b/7ba3386ffwjfwszw3elc7ewy8zqqb88.png',
  daocaoren: 'https://patchwiki.biligame.com/images/nrc/8/83/tef6hxmdoj1d9kakiteuml6pp5h5r97.png',
  lishu: 'https://patchwiki.biligame.com/images/nrc/8/8e/htqhc3kdobwn73xs4dq4fr32k6nxqsa.png',
  xiaolinggu: 'https://patchwiki.biligame.com/images/nrc/3/3f/8v5u9w3ug87kparh17mcxa0ul4knv2r.png',
  xiaoheimao: 'https://patchwiki.biligame.com/images/nrc/c/cb/2rgpnxsglelj43w3sdlxta3mp7k62vz.png',
  doudou: 'https://patchwiki.biligame.com/images/nrc/8/8f/0qcehttkh7cjgcxmrf7hgtbdyltwn1m.png',
  ciluntuoWaxing: 'https://patchwiki.biligame.com/images/nrc/c/ce/hz3rdssei0v48xioj4bh1ddgpmtdgjq.png',
  ciluntuoWaning: 'https://patchwiki.biligame.com/images/nrc/5/51/ex9az18pxdemz97u3fifa90v596vgbj.png',
  dingdingmao: 'https://patchwiki.biligame.com/images/nrc/4/49/1451vq19aroof563gh8wc6lcilbx151.png',
  guiyanzai: 'https://patchwiki.biligame.com/images/nrc/e/e8/qje7sp4cm6nieub43ebug57efsdp1iq.png',
  mimifuy: 'https://patchwiki.biligame.com/images/nrc/4/42/ft9vvktshnapnhbcreonaoiw0ceuxue.png',
  yayanmo: 'https://patchwiki.biligame.com/images/nrc/7/76/dhxk1cqep3uz0yvyfs3pl73fdfvxmkv.png',
  xinyuelu: 'https://patchwiki.biligame.com/images/nrc/f/ff/q2ji8cl28zae1nl13apyzcxiaqqm6w3.png',
  retuantuan: 'https://patchwiki.biligame.com/images/nrc/3/3a/9mc96nw28hvumoec30fpyqgtxp996at.png',
  zhangnaowan: 'https://patchwiki.biligame.com/images/nrc/8/86/h7jfxdksi66wi5hxd0t1pyofg6gc5kw.png',
  weiwanchong: 'https://patchwiki.biligame.com/images/nrc/1/19/suzpim4e1b9rys05yh1w8u97xz8js2o.png',
  daigui: 'https://patchwiki.biligame.com/images/nrc/e/e9/44e2djw05cuxg7pgbv8rt1jg2b5s5gu.png',
  liangfengwan: 'https://patchwiki.biligame.com/images/nrc/8/83/5pgb7ze1ijipoe5mqmlwcmqgodvyxin.png',
  xiaohuandan: 'https://patchwiki.biligame.com/images/nrc/0/04/3g9j2y632cma214cvoo7oi14om5uenc.png',
  youling: 'https://patchwiki.biligame.com/images/nrc/7/77/ncacswlwj812v1f9xguukt51uljy2dg.png',
  xingxingyan: 'https://patchwiki.biligame.com/images/nrc/e/e3/ktkc0ce1phjhv93f8u6cs0eunmdelnm.png',
  buling: 'https://patchwiki.biligame.com/images/nrc/9/9f/hlprd2ju2pdr7cfu8mrz28pn18lne33.png'
}

const pet = (number, name, types, image) => ({ number, name, types, img: img[image] })

const SEASON_PETS = {
  S1: [
    pet('041', '奇丽草', ['草'], 'qilicao'), pet('131', '恶魔狼', ['恶'], 'emolong'),
    pet('137', '呼呼猪', ['冰', '地'], 'huhuzhu'), pet('142', '大耳帽兜', ['冰', '萌'], 'daermaodou'),
    pet('205', '拉特', ['电'], 'late'), pet('255', '治愈兔', ['火', '萌'], 'zhiyutu'),
    pet('263', '机械方方', ['机械'], 'jixiefangfang'), pet('274', '格兰种子', ['草'], 'gelan'),
    pet('293', '小帕尔', ['恶'], 'xiaopar'), pet('307', '绒绒', ['光', '虫'], 'rongrong'),
    pet('310', '犀角鸟', ['光'], 'xijiaoniao'), pet('320', '双灯鱼', ['水', '电'], 'shuangdengyu'),
    pet('322', '月牙雪熊', ['冰', '幻'], 'yueyaxuexiong'), pet('323', '嗜光嗡嗡', ['恶', '光'], 'shiguangwengweng'),
    pet('325', '柴渣虫', ['火', '草'], 'chaizhachong'), pet('327', '空空颅', ['幽'], 'kongkonglu'),
    pet('330', '粉粉星', ['电', '幻'], 'fenfenxing'), pet('332', '贝瑟', ['机械', '火'], 'beise'),
    pet('335', '粉星仔', ['幻'], 'fenxingzai')
  ],
  S2: [
    pet('030', '恶魔叮', ['恶', '翼'], 'emoding'), pet('035', '幽影树', ['幽', '草'], 'youyingshu'),
    pet('052', '嘟嘟煲', ['毒'], 'dudubao'), pet('079', '菊花梨', ['萌'], 'juhuali'),
    pet('085', '小夜', ['恶'], 'xiaoye'), pet('116', '小独角兽', ['光'], 'xiaodushoujiao'),
    pet('147', '灵狐', ['火', '冰'], 'linghu'), pet('162', '公平鸽', ['普通'], 'gongpingge'),
    pet('354', '小雪人', ['冰'], 'xiaoxueren'), pet('356', '爆焰仔', ['火', '龙'], 'baoyanzai'),
    pet('358', '猴麦仔', ['普通', '机械'], 'houmaizai'), pet('360', '加油海葵', ['水', '萌'], 'jiayouhaikui'),
    pet('362', '小丑豆豆', ['恶'], 'xiachoudoudou'), pet('365', '烟花团', ['火', '毒'], 'yanhuatuan'),
    pet('367', '咕咕帽', ['幽'], 'gugumao'), pet('369', '炫光迪迪', ['电', '光'], 'xuanguangdidi'),
    pet('371', '小鼓象', ['机械'], 'xiaoguxiang'), pet('373', '牵线木偶', ['幻'], 'qianxianmuou')
  ],
  S3: [
    pet('071', '伊贝儿', ['草'], 'yibeier'), pet('076', '海盔虫', ['水', '毒'], 'haikuichong'),
    pet('076', '海盔虫（磨损的样子）', ['水', '毒'], 'haikuichongWorn'), pet('099', '小草虫', ['虫', '草'], 'xiaocaochong'),
    pet('177', '斑斑', ['翼'], 'banban'), pet('231', '小鹬', ['翼'], 'xiaoyu'),
    pet('239', '豆丁鱼', ['水', '龙'], 'doudingyu'), pet('266', '可立鸡', ['火'], 'keliji'),
    pet('277', '地鼠（枯水期的样子）', ['地'], 'dishuDry'), pet('277', '地鼠（储水时的样子）', ['地'], 'dishuWater'),
    pet('418', '咬咬小子', ['机械'], 'yaoyaxiaozi'), pet('420', '足尖元件', ['幻', '机械'], 'zujianyuanjian'),
    pet('422', '蝴蝶陶陶', ['萌'], 'huditaotao'), pet('425', '苞米仔', ['草', '火'], 'baomizai'),
    pet('427', '十字蝌蚪', ['水'], 'shizikedou'), pet('430', '卡波', ['恶'], 'kabuo'),
    pet('432', '守夜烛', ['火', '光'], 'shouyezhu'), pet('434', '蜜果骸', ['幽', '草'], 'miguo'),
    pet('436', '稻草人', ['萌', '武'], 'daocaoren'), pet('438', '栗鼠', ['毒', '普通'], 'lishu')
  ],
  S4: [
    pet('021', '小灵菇', ['幽'], 'xiaolinggu'), pet('121', '小黑猫', ['普通'], 'xiaoheimao'),
    pet('198', '逗逗', ['萌'], 'doudou'), pet('237', '刺轮砣（上弦的样子）', ['毒', '萌'], 'ciluntuoWaxing'),
    pet('237', '刺轮砣（下弦的样子）', ['毒', '萌'], 'ciluntuoWaning'), pet('379', '叮叮卯', ['机械', '虫'], 'dingdingmao'),
    pet('400', '瑰眼仔', ['恶', '虫'], 'guiyanzai'), pet('403', '觅觅蝠', ['翼'], 'mimifuy'),
    pet('406', '芽眼魔', ['恶', '水'], 'yayanmo'), pet('446', '新月鹭', ['翼', '冰'], 'xinyuelu'),
    pet('449', '热团团', ['火', '虫'], 'retuantuan'), pet('452', '章脑丸', ['光', '水'], 'zhangnaowan'),
    pet('454', '未完虫', ['幽', '虫'], 'weiwanchong'), pet('455', '玳龟', ['幻'], 'daigui'),
    pet('457', '量风碗', ['翼', '机械'], 'liangfengwan'), pet('459', '小浣蛋', ['恶'], 'xiaohuandan'),
    pet('461', '幽铃', ['幽'], 'youling'), pet('463', '星星眼', ['幻'], 'xingxingyan'),
    pet('464', '布灵', ['幻', '光'], 'buling')
  ]
}

export const SEASONS = Object.keys(SEASON_PETS)

export function getSeasonData(key) {
  const id = String(key || '').toUpperCase()
  if (!Object.prototype.hasOwnProperty.call(SEASON_PETS, id)) return null
  return { id, ...SEASON_META[id], pets: SEASON_PETS[id] }
}
