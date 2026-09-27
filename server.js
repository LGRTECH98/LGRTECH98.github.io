require("dotenv").config();

const express = require("express");
const axios = require("axios");
const path = require("path");

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;


/* ================================
   HOME
================================ */

app.get("/", (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "index.html")
    );
});


/* ================================
   M-PESA
================================ */

async function getMpesaToken() {

    const credentials = Buffer
        .from(
            `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
        )
        .toString("base64");

    const response = await axios.get(
        "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
        {
            headers: {
                Authorization: `Basic ${credentials}`
            }
        }
    );

    return response.data.access_token;
}


app.post("/api/mpesa/stkpush", async (req, res) => {

    try {

        const {
            phone,
            amount
        } = req.body;

        if (!phone || !amount) {

            return res.status(400).json({
                success: false,
                message: "Phone number and amount are required."
            });

        }

        let phoneNumber =
            String(phone).replace(/\D/g, "");

        if (phoneNumber.startsWith("0")) {

            phoneNumber =
                "254" +
                phoneNumber.substring(1);

        }

        if (phoneNumber.startsWith("+")) {

            phoneNumber =
                phoneNumber.substring(1);

        }

        const timestamp =
            new Date()
                .toISOString()
                .replace(/\D/g, "")
                .substring(0, 14);

        const password =
            Buffer.from(
                `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
            ).toString("base64");

        const token =
            await getMpesaToken();

        const response =
            await axios.post(

                "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",

                {
                    BusinessShortCode:
                        process.env.MPESA_SHORTCODE,

                    Password:
                        password,

                    Timestamp:
                        timestamp,

                    TransactionType:
                        "CustomerPayBillOnline",

                    Amount:
                        Math.round(Number(amount)),

                    PartyA:
                        phoneNumber,

                    PartyB:
                        process.env.MPESA_SHORTCODE,

                    PhoneNumber:
                        phoneNumber,

                    CallBackURL:
                        process.env.MPESA_CALLBACK_URL,

                    AccountReference:
                        "LGRSTORE",

                    TransactionDesc:
                        "LGR Store Purchase"
                },

                {
                    headers: {
                        Authorization:
                            `Bearer ${token}`,

                        "Content-Type":
                            "application/json"
                    }
                }
            );


        res.json({
            success: true,
            message:
                "M-PESA payment request sent.",
            data:
                response.data
        });


    } catch (error) {

        console.error(
            "M-PESA ERROR:",
            error.response?.data ||
            error.message
        );

        res.status(500).json({

            success: false,

            message:
                "M-PESA payment could not be started."

        });

    }

});


/* ================================
   M-PESA CALLBACK
================================ */

app.post("/api/mpesa/callback", (req, res) => {

    console.log(
        "M-PESA CALLBACK"
    );

    console.log(
        JSON.stringify(
            req.body,
            null,
            2
        )
    );

    /*
       In a production system:
       - Verify the transaction
       - Save the order
       - Update payment status
       - Send receipt
    */

    res.json({

        ResultCode: 0,

        ResultDesc:
            "Accepted"

    });

});


/* ================================
   PAYPAL
================================ */

const paypalBase =
    process.env.PAYPAL_MODE === "live"

        ? "https://api-m.paypal.com"

        : "https://api-m.sandbox.paypal.com";


async function getPaypalToken() {

    const credentials =
        Buffer
            .from(
                `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
            )
            .toString("base64");


    const response =
        await axios.post(

            `${paypalBase}/v1/oauth2/token`,

            "grant_type=client_credentials",

            {
                headers: {

                    Authorization:
                        `Basic ${credentials}`,

                    "Content-Type":
                        "application/x-www-form-urlencoded"

                }
            }

        );


    return response.data.access_token;
}


/* ================================
   CREATE PAYPAL ORDER
================================ */

app.post(
    "/api/paypal/create-order",
    async (req, res) => {

        try {

            const {
                amount
            } = req.body;


            if (!amount) {

                return res.status(400).json({
                    error:
                        "Amount is required."
                });

            }


            const token =
                await getPaypalToken();


            const response =
                await axios.post(

                    `${paypalBase}/v2/checkout/orders`,

                    {

                        intent:
                            "CAPTURE",

                        purchase_units: [

                            {

                                amount: {

                                    currency_code:
                                        "USD",

                                    value:
                                        Number(amount)
                                            .toFixed(2)

                                }

                            }

                        ]

                    },

                    {

                        headers: {

                            Authorization:
                                `Bearer ${token}`,

                            "Content-Type":
                                "application/json"

                        }

                    }

                );


            res.json({

                id:
                    response.data.id

            });


        } catch (error) {

            console.error(
                "PAYPAL ERROR:",
                error.response?.data ||
                error.message
            );


            res.status(500).json({

                error:
                    "PayPal order could not be created."

            });

        }

    }
);


/* ================================
   CAPTURE PAYPAL ORDER
================================ */

app.post(
    "/api/paypal/capture-order",
    async (req, res) => {

        try {

            const {
                orderID
            } = req.body;


            const token =
                await getPaypalToken();


            const response =
                await axios.post(

                    `${paypalBase}/v2/checkout/orders/${orderID}/capture`,

                    {},

                    {

                        headers: {

                            Authorization:
                                `Bearer ${token}`,

                            "Content-Type":
                                "application/json"

                        }

                    }

                );


            res.json(
                response.data
            );


        } catch (error) {

            console.error(
                "PAYPAL CAPTURE ERROR:",
                error.response?.data ||
                error.message
            );


            res.status(500).json({

                error:
                    "PayPal payment could not be completed."

            });

        }

    }
);


/* ================================
   START SERVER
================================ */

app.listen(
    PORT,
    () => {

        console.log(
            `LGR Store running at http://localhost:${PORT}`
        );

    }
);