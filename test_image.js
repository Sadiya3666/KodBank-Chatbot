// Native fetch is available in Node 18+
async function testImageAnalysis() {
    console.log("Testing Image Analysis Proxy on http://127.0.0.1:5001/api/hf-proxy/models/Salesforce/blip-image-captioning-base...");
    try {
        // Create a tiny fake "image" buffer
        const fakeImageBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

        const response = await fetch('http://127.0.0.1:5001/api/hf-proxy/models/Salesforce/blip-image-captioning-base', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/octet-stream',
                'X-Wait-For-Model': 'true'
            },
            body: fakeImageBuffer
        });

        const data = await response.json();
        console.log("Status Code:", response.status);
        console.log("Response Body:", JSON.stringify(data, null, 2));

        if (response.ok) {
            console.log("\n✅ IMAGE PROXY IS WORKING!");
        } else {
            console.log("\n❌ IMAGE PROXY RETURNED ERROR.");
        }
    } catch (error) {
        console.error("\n❌ TEST FAILED:", error.message);
    }
}

testImageAnalysis();
