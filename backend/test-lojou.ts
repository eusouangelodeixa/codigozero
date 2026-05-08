const LOJOU_API = process.env.LOJOU_API_URL + '/v1';
const LOJOU_KEY = process.env.LOJOU_API_KEY;
const PRODUCT_PID = process.env.LOJOU_PRODUCT_PID || 'uoEHz';
const PLAN_ID = process.env.LOJOU_PLAN_ID || 'tbo8f';

async function run() {
  console.log("LOJOU_API:", LOJOU_API);
  console.log("PRODUCT_PID:", PRODUCT_PID);
  console.log("PLAN_ID:", PLAN_ID);
  
  if (!LOJOU_KEY) {
    console.log("MISSING LOJOU_KEY!");
    return;
  }
  
  try {
    const orderRes = await fetch(`${LOJOU_API}/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOJOU_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        product_pid: PRODUCT_PID,
        plan_id: PLAN_ID,
        amount: 797,
        customer: {
          name: "Test User",
          email: "test@example.com",
          mobile_number: "+258840000000",
        },
      }),
    });
    const orderData = await orderRes.json();
    console.log("Lojou Response:", orderData);
  } catch(e) {
    console.error("Error:", e);
  }
}
run();
