export type RulesLocale = 'zh' | 'en';

type RulesCopy = {
  title: string;
  subtitle: string;
  timingTitle: string;
  back: string;
  sections: Array<{ title: string; items: string[] }>;
};

export const RULES_COPY: Record<RulesLocale, RulesCopy> = {
  zh: {
    title: 'COUP 行动准则', subtitle: '房间对局规则', timingTitle: '计时与超时', back: '返回房间大厅',
    sections: [
      { title: '目标', items: ['每名玩家从两张暗置身份和 2 枚金币开始。两张身份都翻开即被放逐；最后存活者获胜。'] },
      { title: '行动', items: ['Income：获得 1 金币。Foreign Aid：获得 2 金币，可被 Duke 阻挡。Tax：宣称 Duke，获得 3 金币。', 'Steal：宣称 Captain，从一名对手获得至多 2 金币；Captain 或 Ambassador 可阻挡。', 'Assassinate：支付 3 金币，宣称 Assassin，目标失去一张身份；Contessa 可阻挡。', 'Exchange：宣称 Ambassador，与宫廷牌库交换未翻开的身份。Coup：支付 7 金币，指定一名对手失去身份，不能阻挡。'] },
      { title: '质疑与阻挡', items: ['任何角色行动与阻挡均可被质疑。被证明真实的角色会回到宫廷牌库并补抽替代身份，质疑者失去一张身份。', '若角色声明为假，声明者失去一张身份且行动失败。所有可回应者都 Pass 后，行动或阻挡才结算。'] },
      { title: '强制政变', items: ['拥有 10 枚或更多金币时，本回合只能执行 Coup。'] },
      { title: '计时与超时', items: ['真人玩家各自拥有独立的单步时限和整局总时长（若房主启用）。AI 不受时间限制。', '超时时系统会选择合法且保守的操作：回应时 Pass，普通回合 Income，10 金币时对第一位存活对手 Coup，需要弃牌时翻开第一张未翻开身份。'] },
    ],
  },
  en: {
    title: 'COUP FIELD RULES', subtitle: 'Room match protocol', timingTitle: 'Time controls', back: 'Back to rooms',
    sections: [
      { title: 'Objective', items: ['Each player starts with two hidden influences and 2 coins. Reveal both influences and you are exiled; the last survivor wins.'] },
      { title: 'Actions', items: ['Income gains 1. Foreign Aid gains 2 and may be blocked by Duke. Tax claims Duke and gains 3.', 'Steal claims Captain and takes up to 2 from one opponent; Captain or Ambassador may block it.', 'Assassinate pays 3, claims Assassin, and makes a target lose influence; Contessa may block. Exchange claims Ambassador and swaps hidden influences with the Court. Coup pays 7, makes a target lose influence, and cannot be blocked.'] },
      { title: 'Challenges and blocks', items: ['Any character action or block can be challenged. A proven card returns to the Court and is replaced; the challenger loses influence.', 'A false claim loses influence and the action fails. An action or block settles only after every eligible responder passes.'] },
      { title: 'Mandatory Coup', items: ['At 10 or more coins, your only action is Coup.'] },
      { title: 'Time controls', items: ['Each human has an independent per-step limit and total match clock when enabled by the owner. AI seats have no time limit.', 'On timeout the server chooses a legal conservative action: Pass while responding, Income on a normal turn, Coup the first live opponent at 10+ coins, or reveal the first hidden influence when a loss is required.'] },
    ],
  },
};
