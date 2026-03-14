// Native fetch is available in Node 24
async function testChatbot() {
    console.log("Testing Chatbot Proxy on http://127.0.0.1:5001/api/hf-proxy/v1/chat/completions...");
    try {
        const response = await fetch('http://127.0.0.1:5001/api/hf-proxy/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "meta-llama/Llama-3.2-1B-Instruct",
                messages: [{ role: "user", content: "Hello, reply with only the word SUCCESS." }]
            })
        });

        const data = await response.json();
        console.log("Status Code:", response.status);
        console.log("Response Body:", JSON.stringify(data, null, 2));

        if (response.ok && (data.choices?.[0]?.message?.content || "").includes("SUCCESS")) {
            console.log("\n✅ BACKEND PROXY IS WORKING!");
        } else {
            console.log("\n❌ BACKEND PROXY RETURNED ERROR OR UNEXPECTED DATA.");
        }
    } catch (error) {
        console.error("\n❌ TEST FAILED:", error.message);
    }
}

testChatbot();
