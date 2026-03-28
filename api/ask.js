import OpenAI from "openai";

const rateLimitMap = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60000;
  const maxRequests = 10;

  const entry = rateLimitMap.get(ip);

  if (!entry) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }

  if (now - entry.windowStart > windowMs) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count += 1;
  return true;
}

const protocolKnowledge = [
{
topic:"seating",
keywords:["seating","seat","table","placement","delegation","bilateral","multilateral"],
content:`
Bilateral seating normally follows symmetry.
Heads of delegation should occupy central mirrored positions.
Equivalent rank should face equivalent rank.
Advisers are seated by rank and functional relevance.
Interpreters should be positioned to hear both sides clearly.
`
},
{
topic:"flags",
keywords:["flag","flags","order of flags"],
content:`
Flags must be equal size and height.
Bilateral events require visual parity.
Multilateral events often use alphabetical order or host precedence rules.
`
},
{
topic:"titles",
keywords:["title","address","excellency","holiness","eminence"],
content:`
Official titles must be verified before publication.
Full titles should be used on first reference.
Clergy and diplomatic ranks may require institution-specific forms.
`
},
{
topic:"visits",
keywords:["visit","arrival","greeting line","motorcade"],
content:`
Official visits must have a precise sequence:
arrival → greeting → movement → meeting → photo → departure.
Greeting order must follow rank and host protocol.
`
},
{
topic:"checklist",
keywords:["checklist","prepare","organize","planning"],
content:`
Protocol preparation should confirm:
participants
titles
seating
flags
security
media positioning
movement sequence
briefing for principals
`
}
];

function getRelevantKnowledge(question){

const q=question.toLowerCase();
const matches=[];

for(const item of protocolKnowledge){

let score=0;

for(const keyword of item.keywords){

if(q.includes(keyword)){
score++;
}

}

if(score>0){
matches.push({...item,score});
}

}

matches.sort((a,b)=>b.score-a.score);

return matches.slice(0,3).map(item=>item.content).join("\n\n");

}

export default async function handler(req,res){

try{

if(req.method!=="POST"){
return res.status(405).json({error:"Method not allowed"});
}

const forwarded=req.headers["x-forwarded-for"];
const ip=(forwarded||req.socket.remoteAddress||"unknown").split(",")[0].trim();

if(!checkRateLimit(ip)){
return res.status(429).json({error:"Too many requests"});
}

const question=req.body?.question;
const mode=req.body?.mode||"advice";
const language=req.body?.language||"English";
const history=Array.isArray(req.body?.history)?req.body.history:[];

if(!question){
return res.status(400).json({error:"Question required"});
}

let modeInstruction="";

if(mode==="seating"){
modeInstruction=`
Answer as a diplomatic seating advisor.
Explain seating logic clearly.
Provide a suggested seating structure.
`;
}

else if(mode==="checklist"){
modeInstruction=`
Provide a practical diplomatic protocol checklist.
Use short actionable bullet points.
`;
}

else{
modeInstruction=`
Answer as a senior diplomatic protocol advisor.
Provide clear structured guidance.
`;
}

let languageInstruction="Respond in English.";

if(language==="Azərbaycan dili"){
languageInstruction="Respond in Azerbaijani language using professional diplomatic tone.";
}

if(language==="Русский"){
languageInstruction="Respond in Russian using professional diplomatic tone.";
}

if(language==="Türkçe"){
languageInstruction="Respond in Turkish using professional diplomatic tone.";
}

const relevantKnowledge=getRelevantKnowledge(question);

const client=new OpenAI({
apiKey:process.env.OPENAI_API_KEY
});

const completion=await client.chat.completions.create({

model:"gpt-4o-mini",

messages:[

{
role:"system",
content:`
You are ProtocolMind — an AI diplomatic protocol advisor.

Expertise:
diplomatic protocol
precedence rules
seating arrangements
state visits
official delegations
flag protocol
forms of address

Always answer:
clearly
professionally
with practical protocol guidance.

Use this protocol knowledge if relevant:

${relevantKnowledge}

${modeInstruction}

${languageInstruction}
`
},

...history,

{
role:"user",
content:question
}

]

});

const answer=completion.choices?.[0]?.message?.content||"No answer returned.";

return res.status(200).json({answer});

}

catch(error){

console.error("API ERROR:",error);

return res.status(500).json({
error:"Server error",
details:error.message
});

}

}
