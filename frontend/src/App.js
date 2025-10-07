import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './App.css';

const API_URL = 'http://localhost:3001';

function App() {
    const [inputs, setInputs] = useState({
        scenario_name: 'Q4 Pilot Projection',
        monthly_invoice_volume: 2000,
        num_ap_staff: 3,
        avg_hours_per_invoice: 0.17,
        hourly_wage: 30,
        error_rate_manual: 0.5,
        error_cost: 100,
        time_horizon_months: 36,
        one_time_implementation_cost: 50000
    });
    
    const [results, setResults] = useState(null);
    const [email, setEmail] = useState('');
    const [statusMessage, setStatusMessage] = useState('');

    const handleInputChange = (e) => {
        const { name, value, type } = e.target;
        setInputs(prev => ({ 
            ...prev, 
            [name]: type === 'number' ? parseFloat(value) : value 
        }));
    };

    const runSimulation = useCallback(async () => {
        if (!inputs.monthly_invoice_volume) return;
        try {
            const response = await axios.post(`${API_URL}/simulate`, inputs);
            setResults(response.data);
        } catch (error) {
            console.error("Simulation API error:", error);
            setStatusMessage('Error calculating results.');
        }
    }, [inputs]);

    useEffect(() => {
        runSimulation();
    }, [runSimulation]);

    const handleSaveScenario = async (e) => {
        e.preventDefault();
        if (!inputs.scenario_name) {
            setStatusMessage('Please provide a scenario name to save.');
            return;
        }
        try {
            const payload = {
                scenario_name: inputs.scenario_name,
                input_data: inputs,
                result_data: results
            };
            const response = await axios.post(`${API_URL}/scenarios`, payload);
            setStatusMessage(response.data.message);
        } catch (error) {
            console.error("Save scenario error:", error);
            setStatusMessage('Failed to save scenario.');
        }
    };
    
    // --- Updated PDF Download Handler ---
    const handleDownloadReport = async (e) => {
        e.preventDefault();
        if (!email) {
            setStatusMessage('Please enter your email to download the report.');
            return;
        }
        try {
            const response = await axios.post(`${API_URL}/report/generate`, 
                { email, scenario_data: { inputs, results } }, 
                { responseType: 'blob' } // Receive the file as a blob
            );

            const fileURL = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = fileURL;
            link.setAttribute('download', `ROI-Report-${inputs.scenario_name}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
            window.URL.revokeObjectURL(fileURL);

            setStatusMessage('Report downloaded successfully!');
        } catch (error) {
            console.error("Report generation error:", error);
            setStatusMessage('Failed to generate report.');
        }
    };

    return (
        <div className="App">
            <header>
                <h1>Invoicing Automation ROI Simulator</h1>
            </header>
            <main className="container">
                <div className="panel form-panel">
                    <h2>Your Business Metrics</h2>
                    <form>
                        {Object.keys(inputs).map(key => (
                            <div className="form-group" key={key}>
                                <label htmlFor={key}>{key.replace(/_/g, ' ')}</label>
                                <input
                                    type={typeof inputs[key] === 'number' ? 'number' : 'text'}
                                    id={key}
                                    name={key}
                                    value={inputs[key]}
                                    onChange={handleInputChange}
                                    step={key.includes('rate') ? '0.01' : '1'}
                                />
                            </div>
                        ))}
                    </form>
                </div>

                <div className="panel results-panel">
                    <h2>Projected ROI</h2>
                    {results ? (
                        <div className="results-display">
                            <div className="result-item">
                                <span>Monthly Savings</span>
                                <span className="value">${results.monthly_savings}</span>
                            </div>
                            <div className="result-item">
                                <span>Payback Period</span>
                                <span className="value">{results.payback_months} mo</span>
                            </div>
                            <div className="result-item">
                                <span>Net Savings ({inputs.time_horizon_months} mos)</span>
                                <span className="value">${results.net_savings}</span>
                            </div>
                            <div className="result-item roi">
                                <span>Return on Investment</span>
                                <span className="value">{results.roi_percentage}%</span>
                            </div>
                        </div>
                    ) : (
                        <p>Loading results...</p>
                    )}
                    
                    <div className="actions">
                        <h3>Save & Download</h3>
                        <button onClick={handleSaveScenario} className="save-btn">Save This Scenario</button>
                        <form className="report-form" onSubmit={handleDownloadReport}>
                            <input
                                type="email"
                                placeholder="Enter your email for the report"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                            <button type="submit">Download Report</button>
                        </form>
                        {statusMessage && <p className="status-message">{statusMessage}</p>}
                    </div>
                </div>
            </main>
        </div>
    );
}

export default App;