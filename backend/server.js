const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const { body, validationResult } = require('express-validator');
const PDFDocument = require('pdfkit'); 

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

const AUTOMATED_COST_PER_INVOICE = 0.20;
const ERROR_RATE_AUTO = 0.001; // 0.1%
const MIN_ROI_BOOST_FACTOR = 1.1;

// --- Database Connection ---
const dbPool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'Avimohana.04', 
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

// POST /scenarios: Save a simulation with validation
app.post(
    '/scenarios',
    [
        body('scenario_name').trim().notEmpty().withMessage('Scenario name is required.'),
        body('input_data').isObject().withMessage('Input data must be a valid object.'),
        body('result_data').isObject().withMessage('Result data must be a valid object.')
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const { scenario_name, input_data, result_data } = req.body;
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
    }
);

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

// POST /report/generate: Capture email and generate a PDF report
app.post(
    '/report/generate',
    [
        body('email').isEmail().normalizeEmail().withMessage('A valid email is required.'),
        body('scenario_data').isObject().withMessage('Scenario data is required for the report.')
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, scenario_data } = req.body;
        const { inputs, results } = scenario_data;

        // Save the lead email
        try {
    //insert or update, avoiding the duplicate error
    await dbPool.execute(
        'INSERT INTO leads (email) VALUES (?) ON DUPLICATE KEY UPDATE created_at = NOW()', 
        [email]
    );
} catch (dbError) {
    console.error("Failed to save lead:", dbError);
}

        // --- PDF Generation Logic ---
        const doc = new PDFDocument({ margin: 50 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=ROI-Report-${inputs.scenario_name}.pdf`);

        doc.pipe(res);

        doc.fontSize(20).text('Invoicing Automation ROI Report', { align: 'center' });
        doc.moveDown();
        doc.fontSize(16).text(`Scenario: ${inputs.scenario_name}`);
        doc.moveDown(2);
        doc.fontSize(14).text('Key Results', { underline: true });
        doc.moveDown();
        doc.fontSize(12).text(`Monthly Savings: $${results.monthly_savings}`);
        doc.fontSize(12).text(`Payback Period: ${results.payback_months} months`);
        doc.fontSize(12).text(`Net Savings (${inputs.time_horizon_months} months): $${results.net_savings}`);
        doc.fontSize(12).text(`Return on Investment (ROI): ${results.roi_percentage}%`);
        doc.moveDown(2);
        doc.fontSize(14).text('Inputs Used', { underline: true });
        doc.moveDown();
        Object.entries(inputs).forEach(([key, value]) => {
            doc.fontSize(10).text(`${key.replace(/_/g, ' ')}: ${value}`);
        });

        doc.end();
    }
);

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});