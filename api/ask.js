import OpenAI from "openai";

const rateLimitMap = new Map();

function checkRateLimit(ip){

const now=Date.now()
const windowMs=60000
const maxRequests=15

const entry=rateLimitMap.get(ip)

if(!entry){
rateLimitMap.set(ip,{count:1,windowStart:now})
return true
}

if(now-entry.windowStart>windowMs){
rateLimitMap.set(ip,{count:1,windowStart:now})
return true
}

if(entry.count>=maxRequests){
return false
}

entry.count++
return true

}

const protocolKnowledge=[

{
topic:"seating arrangements",
keywords:["seating","seat","table","delegation","rectangular","round","meeting"],
content:`
Bilateral meetings should follow symmetry and parity.
Heads of delegation should sit centrally opposite each other.
Equivalent ranks should face each other.
Advisers should be placed according to seniority and functional relevance.
Interpreters should be positioned where they hear both delegations clearly.
`
},

{
topic:"precedence",
keywords:["precedence","order","ranking","protocol order"],
content:`
Precedence determines the order of officials at events.
It is based on rank, office, diplomatic status, and host-country rules.
In multilateral settings alphabetical order is often used.
Hosts normally take precedence in their own country.
`
},

{
topic:"official visits",
keywords:["official visit","visit","state visit","working visit"],
content:`
Official visits require precise sequence planning.
Typical sequence includes arrival ceremony, greeting line, bilateral meeting, press interaction, official meal, and departure.
Protocol services must coordinate closely with security and media teams.
`
},

{
topic:"flag protocol",
keywords:["flag","flags","national flag","flag order"],
content:`
Flags must always be displayed with equal dignity.
In bilateral events both national flags must have equal height and size.
In multilateral events flag order may follow alphabetical order or institutional rules.
`
},

{
topic:"greeting line",
keywords:["greeting","receiving line","welcome line"],
content:`
Greeting lines should be arranged according to precedence.
Hosts normally stand first followed by senior officials.
Each participant should be clearly introduced to the visiting principal.
`
},

{
topic:"interpreters",
keywords:["interpreter","translation","simultaneous interpretation"],
content:`
Interpreters must be positioned to hear both sides clearly.
Simultaneous interpretation equipment should be tested in advance.
Protocol should coordinate interpreter placement with seating arrangements.
`
},

{
topic:"diplomatic titles",
keywords:["title","excellency","eminence","holiness"],
content:`
Correct titles are essential in diplomatic protocol.
Heads of state are often addressed as 'Your Excellency'.
Religious leaders may require titles such as 'Your Holiness' or 'Your Eminence'.
Titles must always be verified in advance.
`
},

{
topic:"gift exchange",
keywords:["gift","gift exchange","protocol gift"],
content:`
Official gifts should reflect respect and cultural sensitivity.
They should match the rank of the visitor.
Items should avoid political or cultural controversy.
`
},

{
topic:"press protocol",
keywords:["press","media","press conference","photo opportunity"],
content:`
Media events should follow protocol order.
Photo opportunities usually occur at the beginning of meetings.
Press access should be coordinated with security services.
`
},

{
topic:"motorcade",
keywords:["motorcade","escort","transport"],
content:`
VIP motorcades require coordination between protocol and security teams.
Vehicles must be arranged according to rank.
Routes should be cleared and timing strictly controlled.
`
},

{
topic:"official dinners",
keywords:["dinner","banquet","official meal"],
content:`
Official dinners follow strict seating and speaking order.
Hosts usually deliver the first toast.
Menus should consider cultural and dietary requirements.
`
},

{
topic:"multilateral meetings",
keywords:["multilateral","conference","forum"],
content:`
Multilateral meetings often use alphabetical order or institutional precedence.
Seating arrangements must ensure neutrality among participants.
`
},

{
topic:"protocol planning",
keywords:["planning","organizing","protocol planning"],
content:`
Protocol planning requires detailed preparation including seating plans, flag placement, greeting sequences, and briefing notes.
All elements should be rehearsed in advance.
`
},

{
topic:"security coordination",
keywords:["security","protection","protocol security"],
content:`
Protocol teams must coordinate closely with security services.
Security considerations may affect seating, entrances, and movement sequences.
`
},

{
topic:"parliamentary protocol",
keywords:["parliament","speaker","delegation"],
content:`
Parliamentary protocol often follows institutional rules.
Delegations should be received by equivalent parliamentary officials.
Ceremonial aspects may include speeches, gift exchanges, and media events.
`
}

]

function getRelevantKnowledge(question){

const q=question.toLowerCase()

const matches=[]

for(const item of protocolKnowledge){

let score=0

for(const keyword of item.keywords){

if(q.includes(keyword)){
score++
}

}

if(score>0){
matches.push({...item,score})
}

}

matches.sort((a,b)=>b.score-a.score)

return matches.slice(0,4).map(item=>item.content).join("\n\n")

}

export default async function handler(req,res){

try{

if(req.method!=="POST"){
return res.status(405).json({error:"Method not allowed"})
}

const forwarded=req.headers["x-forwarded-for"]
const ip=(forwarded||req.socket.remoteAddress||"unknown").split(",")[0].trim()

if(!checkRateLimit(ip)){
return res.status(429).json({error:"Too many requests"})
}

const question=req.body?.question
const mode=req.body?.mode||"advice"
const language=req.body?.language||"English"
const history=Array.isArray(req.body?.history)?req.body.history:[]

if(!question){
return res.status(400).json({error:"Question required"})
}

let languageInstruction="Respond in English."

if(language==="Azərbaycan dili"){
languageInstruction="Respond in Azerbaijani language using professional diplomatic tone."
}

if(language==="Русский"){
languageInstruction="Respond in Russian using professional diplomatic tone."
}

if(language==="Türkçe"){
languageInstruction="Respond in Turkish using professional diplomatic tone."
}

const relevantKnowledge=getRelevantKnowledge(question)

const client=new OpenAI({
apiKey:process.env.OPENAI_API_KEY
})

const completion=await client.chat.completions.create({

model:"gpt-4o-mini",

messages:[

{
role:"system",
content:`

You are ProtocolMind — an AI diplomatic protocol advisor.

Your expertise includes:

diplomatic protocol
state visits
precedence
seating arrangements
flag protocol
diplomatic titles
parliamentary protocol
official ceremonies

Always answer clearly and professionally.

Use this protocol knowledge when relevant:

${relevantKnowledge}

${languageInstruction}

`
},

...history,

{
role:"user",
content:question
}

]

})

const answer=completion.choices?.[0]?.message?.content||"No answer returned."

return res.status(200).json({answer})

}

catch(error){

console.error("API ERROR:",error)

return res.status(500).json({
error:"Server error",
details:error.message
})

}

}
