require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;

// Ensure MongoDB URI is provided
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("[ERROR] MONGODB_URI is not defined in the .env file.");
  process.exit(1);
}

// Create a new MongoClient instance with recommended options
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

app.use(cors());
app.use(express.json());

/**
 * Connect to MongoDB and start the server
 */
async function startServer() {
  try {
    await client.connect();
    console.log("[INFO] Successfully connected to MongoDB!");

    // Start the server only after a successful connection
    app.listen(port, () => {
      console.log(`[INFO] Server is running on port ${port}`);
    });
  } catch (error) {
    console.error("[ERROR] MongoDB connection error:", error);
    process.exit(1);
  }
}

startServer();

/**
 * Fetch all valid orders (those with labels) from OrderHeaders
 */
app.get("/order-headers", async (req, res) => {
  try {
    const database = client.db("Tayco");

    const validOrderNumbers = await database
      .collection("Labels")
      .distinct("OrderNr");

    if (!validOrderNumbers || validOrderNumbers.length === 0) {
      console.warn("[WARN] No valid orders found in Labels.");
      return res.status(404).json({ error: "No valid orders found." });
    }

    const orders = await database
      .collection("OrderHeaders")
      .find({ OrderNr: { $in: validOrderNumbers } })
      .toArray();

    if (!orders || orders.length === 0) {
      console.warn("[WARN] No matching orders found in OrderHeaders.");
      return res.status(404).json({ error: "No matching orders found." });
    }

    res.status(200).json(orders);
  } catch (error) {
    console.error(`[ERROR] Error fetching valid orders: ${error.message}`);
    res.status(500).json({ error: "Error fetching valid orders." });
  }
});

/**
 * Fetch enriched order details for a specific order
 */
app.get("/order-details/:orderNr", async (req, res) => {
  try {
    const orderNr = parseInt(req.params.orderNr, 10);

    if (isNaN(orderNr)) {
      return res.status(400).json({ error: "OrderNr must be a valid number." });
    }

    const database = client.db("Tayco");

    // Fetch labels for the given order
    const orderDetails = await database
      .collection("Labels")
      .find({ OrderNr: orderNr })
      .toArray();

    if (!orderDetails || orderDetails.length === 0) {
      return res
        .status(404)
        .json({ error: `No valid labels found for OrderNr: ${orderNr}` });
    }

    res.status(200).json({
      OrderNr: orderNr,
      PlantDate: orderDetails[0]?.PlantDate || null,
      Details: orderDetails.map((label) => ({
        ItemNumber: label.ItemNumber,
        Quantity: label.Quantity,
        ItemDescription: label.ItemDescription,
        PickAreaName: label.PickAreaName,
        SmallText: label.SmallText || null,
        UOM: label.UOM || null,
        BarcodeID: label.barcodeId || `${orderNr}-${label.ItemNumber}`, // Generate BarcodeID if missing
      })),
    });
  } catch (error) {
    console.error(`[ERROR] Error fetching order details: ${error.message}`);
    res.status(500).json({ error: "Error fetching order details." });
  }
});

/**
 * Fetch a single label by its Barcode ID
 */
app.get("/labels/:barcodeId", async (req, res) => {
  try {
    const barcodeId = req.params.barcodeId;

    if (!barcodeId) {
      return res.status(400).json({ error: "Barcode ID is required." });
    }

    const database = client.db("Tayco");

    // Debug log to verify the barcodeId being searched
    console.log(`[DEBUG] Searching for label with Barcode ID: ${barcodeId}`);

    // Correct the field name in the query to match the database schema
    const label = await database.collection("Labels").findOne({ barcodeId });

    if (!label) {
      console.warn(`[WARN] Label not found for ID: ${barcodeId}`);
      return res
        .status(404)
        .json({ error: `Label not found for ID: ${barcodeId}` });
    }

    res.status(200).json(label);
  } catch (error) {
    console.error(
      `[ERROR] Fetching label failed for Barcode ID: ${req.params.barcodeId}. Error: ${error.message}`
    );
    res.status(500).json({ error: "Error fetching label." });
  }
});

/**
 * Fallback route for undefined endpoints
 */
app.use((req, res) => {
  res.status(404).json({ error: "Route not found." });
});
