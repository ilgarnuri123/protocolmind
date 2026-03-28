import OpenAI from "openai";

export default async function handler(req, res) {

const client=new OpenAI({
apiKey:process.env.OPENAI_API_KEY
});

const completion=await client.chat.completions.create({
model:"gpt-4o-mini",
messages:[
{
role:"system",
content:"You are an expert diplomatic protocol advisor."
},
{
role:"user",
content:req.body.question
}
]
});

res.json({
answer:completion.choices[0].message.content
});

}
