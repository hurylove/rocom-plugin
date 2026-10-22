/** 洛克王国世界活动档案快照。来源：wiki.biligame.com/nrc/活动档案，抓取时间：2026-10-22T16:54:48+08:00。 */
const CATEGORY = {
  gifts: '签到与福利',
  pets: '精灵与探索',
  challenge: '对战与试炼',
  fashion: '时装与摄影',
  events: '节庆与日常'
}

const activity = (id, title, code, start, end, rewards, cover) => ({
  id, title, category: CATEGORY[code] || code, start, end, rewards, cover
})

const ACTIVITY_DATA = {
  updatedAt: '2026-10-22T16:54:48+08:00',
  totalActive: 25,
  totalUpcoming: 14,
  active: [
    activity('activity_53000011', '大世界观察笔记', 'gifts', '2026-10-16 04:00', '2026-10-23 03:59', '贤者碎晶 · 能力钥匙 · 月涌代币', 'https://patchwiki.biligame.com/images/nrc/thumb/7/7f/sepl3vs4m3vdtwps5ybq5qc5zjawj77.png/640px-Activity_Image_5d6cb7d9dc12b5f5.png'),
    activity('activity_53000012', '皮卡月刊上新!', 'fashion', '2026-10-09 04:00', '2026-10-23 03:59', '溯源钟印象 · 克莱因龙印象 · 测风蝉印象', 'https://patchwiki.biligame.com/images/nrc/thumb/e/e3/omzyvtkpktzzla9w6n58uts3tbhj0bi.png/640px-Activity_Image_a6eb999f2931ac04.png'),
    activity('activity_53000013', '命定花种', 'pets', '2026-10-09 04:00', '2026-10-23 03:59', '', 'https://patchwiki.biligame.com/images/nrc/thumb/8/8d/hlosbdyswtf9v0vkvlvqi4q4z5flg10.png/640px-Activity_Image_6f2fc761f3773874.png'),
    activity('activity_53000014', '皮卡摄影委托', 'fashion', '2026-10-09 04:00', '2026-10-23 03:59', '怪奇实验合影', 'https://patchwiki.biligame.com/images/nrc/thumb/d/d4/s6j84qua9hlps6cd700qjy8imi1rk3x.png/640px-Activity_Image_70f06d2c479f338a.png'),
    activity('activity_53000015', '星光对决', 'challenge', '2026-10-19 04:00', '2026-10-26 03:59', '', 'https://patchwiki.biligame.com/images/nrc/thumb/7/71/2ucy776t61f6uztfxg3aofcpibiw8nc.png/640px-Activity_Starlight_1032_V1.png'),
    activity('activity_53000016', '命运对决', 'challenge', '2026-10-19 04:00', '2026-11-02 03:59', '月涌代币', 'https://patchwiki.biligame.com/images/nrc/thumb/5/5d/2njlw8mvxhr198toaffok8pmwz3nfzp.png/640px-Activity_Image_95a07f55e956966c.png'),
    activity('activity_53000017', '噜噜的调研时间', 'gifts', '2026-09-10 04:00', '2026-11-04 03:59', '', 'https://patchwiki.biligame.com/images/nrc/thumb/2/28/7mz7704u1g0j1p28bwy2cme0lgve83o.png/640px-Activity_Image_d5de4a7864953de1.png'),
    activity('activity_53000018', '周边屋·徽章上新', 'fashion', '2026-09-10 04:00', '2026-11-04 20:59', '', 'https://patchwiki.biligame.com/images/nrc/thumb/1/18/8ulpjobrlwm00l2dgx8re3md5mexzmx.png/640px-Activity_Image_5590045bc57a3757.png'),
    activity('activity_2003', '龙息帕尔再临', 'pets', '2026-10-01 04:00', '2026-11-05 03:59', '', 'https://patchwiki.biligame.com/images/nrc/thumb/e/e2/q40l9hzuk9zlsffollhvmmryolj2m3k.png/640px-Activity_Poster_LegendReturn.png'),
    activity('activity_53000019', '草系徽章试炼', 'challenge', '2026-07-30 12:00', '2026-11-05 03:59', '', 'https://patchwiki.biligame.com/images/nrc/thumb/f/f9/cm9gmxuolgohzrh8mp32httcejgnliy.png/640px-Activity_Image_6e426dc261033fcd.png'),
    activity('activity_53000020', '王国之约', 'gifts', '2026-09-10 04:00', '2026-11-05 03:59', '四角星炫彩蛋 · 国王球 · 爱心炫彩蛋', 'https://patchwiki.biligame.com/images/nrc/thumb/b/b1/jhps88581kbqa4btw345fsvg8ggd8oh.png/640px-Activity_Image_9941d17efd11e4f7.png'),
    activity('activity_53000021', '为相伴加冕', 'pets', '2026-09-10 04:00', '2026-11-05 03:59', '同心相伴 · 精灵稀有卡牌', 'https://patchwiki.biligame.com/images/nrc/thumb/c/c8/5d43mcdj5865jawcv2fmqg23rgs97lz.png/640px-Activity_Image_2bb9316edbc20365.png')
  ],
  upcoming: [
    activity('activity_53000022', '皮卡月刊上新!', 'fashion', '2026-10-23 04:00', '2026-11-05 03:59', '罗隐印象 · 蝎子王印象 · 晶石蜗印象', 'https://patchwiki.biligame.com/images/nrc/thumb/4/45/0nryybvjnk7oha8j24oun0gjqw4i6xw.png/640px-FashionMonthlyPoster_12101.png'),
    activity('activity_53000023', '500%孵蛋加速日', 'pets', '2026-10-23 04:00', '2026-10-26 03:59', '', 'https://patchwiki.biligame.com/images/nrc/thumb/1/13/lizm0ft6h7z8jkfar74pq8sy6xl5b7q.png/640px-Activity_Image_7b88d20d5047f706.png'),
    activity('activity_53000024', '芽眼魔大量出没', 'pets', '2026-10-23 04:00', '2026-10-26 03:59', '月涌代币 · 芽眼魔的蛋', 'https://patchwiki.biligame.com/images/nrc/thumb/f/f7/tabzbmm9b4uyssbiatmfyx5nwmy66ka.png/640px-Activity_Outbreak_1900034_V1.png'),
    activity('activity_53000025', '远行商人上新!', 'events', '2026-10-23 04:00', '2026-10-25 23:59', '', 'https://patchwiki.biligame.com/images/nrc/thumb/e/ec/dz4c967zl7robk9b0h0lw9oflubncmz.png/640px-Activity_Image_630e614cc5ad4c98.png'),
    activity('activity_53000026', '闪耀周末', 'challenge', '2026-10-23 04:00', '2026-10-26 03:59', '', 'https://patchwiki.biligame.com/images/nrc/thumb/d/d2/h7f3fkt5yx2vtd0dhze6xajdg4k1vfl.png/640px-Activity_Image_ac8dd4c41d962833.png'),
    activity('activity_53000027', '皮卡摄影委托', 'fashion', '2026-10-23 04:00', '2026-11-05 03:59', '宝石狩猎合影', 'https://patchwiki.biligame.com/images/nrc/thumb/7/79/dpt6g0vuxnwhqbustzkhy5vn272hkj1.png/640px-Activity_Image_59fb0cff9689c7b7.png'),
    activity('activity_53000028', '小豚安家记', 'pets', '2026-10-23 04:00', '2026-11-06 03:59', '', 'https://patchwiki.biligame.com/images/nrc/thumb/8/8e/9zjusotqfcbbe4gl0tf996hhjzdieht.png/640px-Activity_Image_62fbf1d37d241aa5.png'),
    activity('activity_53000029', '星光对决', 'challenge', '2026-10-26 04:00', '2026-11-02 03:59', '', 'https://patchwiki.biligame.com/images/nrc/thumb/f/ff/hoxzezsfdtuioi5vsv7mrjnjmduojjk.png/640px-Activity_Starlight_1033_V1.png')
  ]
}

export function getActivityOverview() { return ACTIVITY_DATA }
