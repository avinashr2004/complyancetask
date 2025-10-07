const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

const AUTOMATED_COST_PER_INVOICE = 0.20;
const ERROR_RATE_AUTO = 0.001; // 0.1%
const MIN_ROI_BOOST_FACTOR = 1.1;

// --- Database Connection ---
// !!! IMPORTANT: Replace with your actual MySQL credentials !!!
const dbPool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'Avimohana.04', // <-- CHANGE THIS
    database: 'roi_calculator'
});

// --- API Endpoints ---

// POST /simulate: Run the ROI calculation
app.post('/simulate', (req, res) => {
    try {
        const inputs = req.body;

        const labor_cost_manual = inputs.num_ap_staff * inputs.hourly_wage * inputs.avg_hours_per_invoice * inputs.monthly_invoice_volume;
        const auto_cost = inputs.monthly_invoice_volume * AUTOMATED_COST_PER_INVOICE;
        const error_savings = ((inputs.error_rate_manual / 100) - ERROR_RATE_AUTO) * inputs.monthly_invoice_volume * inputs.error_cost;
        let monthly_savings = (labor_cost_manual + error_savings) - auto_cost;
        monthly_savings = monthly_savings * MIN_ROI_BOOST_FACTOR;
        
        const one_time_cost = inputs.one_time_implementation_cost || 0;
        const cumulative_savings = monthly_savings * inputs.time_horizon_months;
        const net_savings = cumulative_savings - one_time_cost;
        const payback_months = one_time_cost > 0 && monthly_savings > 0 ? one_time_cost / monthly_savings : 0;
        const roi_percentage = one_time_cost > 0 ? (net_savings / one_time_cost) * 100 : Infinity;

        const results = {
            monthly_savings: monthly_savings.toFixed(2),
            net_savings: net_savings.toFixed(2),
            payback_months: payback_months.toFixed(1),
            roi_percentage: roi_percentage === Infinity ? 'Infinite' : roi_percentage.toFixed(2),
        };

        res.json(results);
    } catch (error) {
        res.status(500).json({ error: 'Calculation error', details: error.message });
    }
});

// POST /scenarios: Save a simulation
app.post('/scenarios', async (req, res) => {
    const { scenario_name, input_data, result_data } = req.body;
    if (!scenario_name || !input_data || !result_data) {
        return res.status(400).json({ error: 'Missing required scenario data.' });
    }
    try {
        const [result] = await dbPool.execute(
            'INSERT INTO scenarios (scenario_name, input_data, result_data) VALUES (?, ?, ?)',
            [scenario_name, JSON.stringify(input_data), JSON.stringify(result_data)]
        );
        res.status(201).json({ id: result.insertId, message: 'Scenario saved successfully!' });
    } catch (error) {
        console.error("Database error on POST /scenarios:", error);
        res.status(500).json({ error: 'Failed to save scenario to the database.' });
    }
});

// GET /scenarios: List all saved scenarios
app.get('/scenarios', async (req, res) => {
    try {
        const [rows] = await dbPool.query('SELECT id, scenario_name, created_at FROM scenarios ORDER BY created_at DESC');
        res.json(rows);
    } catch (error) {
        console.error("Database error on GET /scenarios:", error);
        res.status(500).json({ error: 'Failed to retrieve scenarios.' });
    }
});

// POST /report/generate: Capture email and generate an HTML report
app.post('/report/generate', async (req, res) => {
    const { email, scenario_data } = req.body;

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ error: 'A valid email is required.' });
    }

    // 1. Save the lead
    try {
        await dbPool.execute('INSERT INTO leads (email) VALUES (?)', [email]);
    } catch (dbError) {
        console.error("Failed to save lead:", dbError);
        // We don't block the user if this fails, just log it.
    }

    // 2. Generate HTML report
    const { inputs, results } = scenario_data;
    const reportDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const htmlReport = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-g">
            <title>ROI Report for ${inputs.scenario_name}</title>
            <style>
                body { font-family: sans-serif; margin: 40px; }
                .container { max-width: 800px; margin: auto; border: 1px solid #ccc; padding: 20px; border-radius: 8px; }
                h1, h2, h3 { color: #333; }
                p { line-height: 1.6; }
                ul { list-style-type: none; padding: 0; }
                li { background: #f4f4f4; margin-bottom: 8px; padding: 10px; border-radius: 4px; }
                strong { color: #0056b3; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>ROI Simulation Report</h1>
                <p>Generated on: ${reportDate}</p>
                <h2>Scenario: <strong>${inputs.scenario_name}</strong></h2>
                <h3>Key Results</h3>
                <ul>
                    <li><strong>Monthly Savings:</strong> $${results.monthly_savings}</li>
                    <li><strong>Payback Period:</strong> ${results.payback_months} months</li>
                    <li><strong>Net Savings (${inputs.time_horizon_months} months):</strong> $${results.net_savings}</li>
                    <li><strong>Return on Investment (ROI):</strong> ${results.roi_percentage}%</li>
                </ul>
                <hr/>
                <h3>Inputs Used for this Calculation</h3>
                <ul>
                    ${Object.entries(inputs).map(([key, value]) => `<li><strong>${key.replace(/_/g, ' ')}:</strong> ${value}</li>`).join('')}
                </ul>
            </div>
        </body>
        </html>
    `;

    res.header('Content-Type', 'text/html');
    res.send(htmlReport);
});


// --- Start Server ---
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});