'use strict';
// Synthetic lyrics: annotation and sung parenthetical parts in the same line.
const mixed={target:'扉（とびら ）へ進む（君の声）',visible:'扉へ進む（君の声）',hidden:['（とびら ）'],
 html:'<span class="ruby"><span class="rb">扉</span><span class="rt">とびら</span></span>へ<span class="ruby"><span class="rb">進</span><span class="rt">すす</span></span>む（<span class="ruby"><span class="rb">君</span><span class="rt">きみ</span></span>の<span class="ruby"><span class="rb">声</span><span class="rt">こえ</span></span>）'};
const echo={target:'星(ほし)と空(そら)をみる',visible:'星と空(そら)をみる',hidden:['(ほし)'],romaji:'ho shi to so ra so ra wo mi ru',
 html:'<span class="ruby"><span class="rb">星</span><span class="rt">ほし</span></span>と<span class="ruby"><span class="rb">空</span><span class="rt">そら</span></span>(そら)をみる'};
module.exports={mixed,echo};
