'use strict';
// Minimal line supplied in the user's reproduction, not a full-song fixture.
const target='思春期疵口(きずぐち)胸のうち';
const line={text:'思春期 疵口 胸のうち',segments:[{text:'思春期',rt:'ししゅんき'},{text:' '},{text:'疵口',rt:'きずぐち'},{text:' '},{text:'胸',rt:'むね'},{text:'のうち'}]};
const html='<span class="ruby"><span class="rb">思春期</span><span class="rt">ししゅんき</span></span> <span class="ruby"><span class="rb">疵口</span><span class="rt">きずぐち</span></span> <span class="ruby"><span class="rb">胸</span><span class="rt">むね</span></span>のうち';
module.exports={target,line,html};
