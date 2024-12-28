require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://35.212.41.99:3000',
        'https://35.212.41.99:3000',
        // Add any other domains that need access
    ],
    methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: true
}));

// Database configuration
const dbConfig = {
    host: '34.48.50.74',
    port: 3306,
    user: 'krp2203',
    password: 'f_j(/"xa|i=h+ccU',
    database: 'kpm dealer data',
    // MySQL 8 specific settings
    authPlugins: {
        mysql_native_password: () => ({
            protocol41: true,
            parseTime: true,
            supportBigNumbers: true,
            connectAttributes: {
                _client_name: 'mysql_client',
                _client_version: '8.0.19',
                program_name: 'mysql_nodejs'
            }
        })
    },
    connectTimeout: 20000,
    ssl: false,
    multipleStatements: true,
    dateStrings: true,
    charset: 'UTF8MB4'
};

// Create a connection pool for better performance
const pool = mysql.createPool(dbConfig);
const promisePool = pool.promise();

// Get list of all dealers
app.get('/api/dealers', async (req, res) => {
    try {
        const [rows] = await promisePool.query(`
            SELECT DISTINCT 
                d.KPMDealerNumber,
                d.DealershipName,
                d.DBA,
                d.SalesmanCode
            FROM Dealerships d
            ORDER BY d.DealershipName
        `);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching dealers:', error);
        res.status(500).json({ error: 'Failed to fetch dealers' });
    }
});

// Get complete dealer details by dealer number
app.get('/api/dealers/:dealerNumber', async (req, res) => {
    try {
        console.log('=== GET DEALER DETAILS ===');
        console.log('Dealer Number:', req.params.dealerNumber);

        // Get dealer basic info with salesman details
        const [dealerInfo] = await promisePool.query(`
            SELECT 
                d.KPMDealerNumber,
                d.DealershipName,
                d.DBA,
                d.SalesmanCode,
                s.SalesmanName
            FROM Dealerships d
            LEFT JOIN Salesman s ON d.SalesmanCode = s.SalesmanCode
            WHERE d.KPMDealerNumber = ?
        `, [req.params.dealerNumber]);

        if (dealerInfo.length === 0) {
            return res.status(404).json({ error: 'Dealer not found' });
        }

        // Get address information
        const [address] = await promisePool.query(`
            SELECT 
                StreetAddress,
                BoxNumber,
                City,
                State,
                ZipCode,
                County
            FROM Addresses 
            WHERE KPMDealerNumber = ?
        `, [req.params.dealerNumber]);

        // Get contact information
        const [contact] = await promisePool.query(`
            SELECT 
                MainPhone,
                FaxNumber,
                MainEmail
            FROM ContactInformation 
            WHERE KPMDealerNumber = ?
        `, [req.params.dealerNumber]);

        // Get lines carried
        const [lines] = await promisePool.query(`
            SELECT 
                LineName,
                AccountNumber
            FROM LinesCarried 
            WHERE KPMDealerNumber = ?
        `, [req.params.dealerNumber]);

        // Structure the response
        const dealerDetails = {
            KPMDealerNumber: dealerInfo[0].KPMDealerNumber,
            DealershipName: dealerInfo[0].DealershipName,
            DBA: dealerInfo[0].DBA || '',
            address: address[0] || {
                StreetAddress: '',
                BoxNumber: '',
                City: '',
                State: '',
                ZipCode: '',
                County: ''
            },
            contact: contact[0] || {
                MainPhone: '',
                FaxNumber: '',
                MainEmail: ''
            },
            lines: lines || [],
            salesman: {
                SalesmanName: dealerInfo[0].SalesmanName || '',
                SalesmanCode: dealerInfo[0].SalesmanCode || ''
            }
        };

        console.log('Sending dealer details:', JSON.stringify(dealerDetails, null, 2));
        res.json(dealerDetails);

    } catch (error) {
        console.error('Error fetching dealer details:', error);
        res.status(500).json({ error: 'Failed to fetch dealer details' });
    }
});

// Add a root route
app.get('/', (req, res) => {
    res.json({ message: 'KPM Dealer Database API' });
});

// Add this new endpoint
app.put('/api/dealers/:dealerNumber', async (req, res) => {
    try {
        const dealerNumber = req.params.dealerNumber;
        const updatedDealer = req.body;
        
        console.log('=== START UPDATE ===');
        console.log('Updating dealer:', dealerNumber);
        console.log('Received data:', JSON.stringify(updatedDealer, null, 2));

        // Log each update operation
        console.log('Updating Dealerships table...');
        const [dealerResult] = await promisePool.query(`
            UPDATE Dealerships 
            SET DealershipName = ?, DBA = ?
            WHERE KPMDealerNumber = ?
        `, [updatedDealer.DealershipName, updatedDealer.DBA, dealerNumber]);
        console.log('Dealerships update result:', dealerResult);

        // Update Addresses - first check if address exists
        const [existingAddress] = await promisePool.query(`
            SELECT * FROM Addresses WHERE KPMDealerNumber = ?
        `, [dealerNumber]);

        if (existingAddress.length === 0) {
            // Insert new address if it doesn't exist
            await promisePool.query(`
                INSERT INTO Addresses (
                    KPMDealerNumber, 
                    StreetAddress, 
                    City, 
                    State, 
                    ZipCode, 
                    County, 
                    BoxNumber
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
                dealerNumber,
                updatedDealer.address.StreetAddress,
                updatedDealer.address.City,
                updatedDealer.address.State,
                updatedDealer.address.ZipCode,
                updatedDealer.address.County,
                updatedDealer.address.BoxNumber
            ]);
        } else {
            // Update existing address
            await promisePool.query(`
                UPDATE Addresses 
                SET 
                    StreetAddress = ?, 
                    City = ?, 
                    State = ?, 
                    ZipCode = ?, 
                    County = ?, 
                    BoxNumber = ?
                WHERE KPMDealerNumber = ?
            `, [
                updatedDealer.address.StreetAddress,
                updatedDealer.address.City,
                updatedDealer.address.State,
                updatedDealer.address.ZipCode,
                updatedDealer.address.County,
                updatedDealer.address.BoxNumber,
                dealerNumber
            ]);
        }
        console.log('Address update completed');

        // Update ContactInformation - first check if contact exists
        const [existingContact] = await promisePool.query(`
            SELECT * FROM ContactInformation WHERE KPMDealerNumber = ?
        `, [dealerNumber]);

        if (existingContact.length === 0) {
            // Insert new contact if it doesn't exist
            await promisePool.query(`
                INSERT INTO ContactInformation (
                    KPMDealerNumber,
                    MainPhone,
                    FaxNumber,
                    MainEmail
                ) VALUES (?, ?, ?, ?)
            `, [
                dealerNumber,
                updatedDealer.contact.MainPhone,
                updatedDealer.contact.FaxNumber,
                updatedDealer.contact.MainEmail
            ]);
        } else {
            // Update existing contact
            await promisePool.query(`
                UPDATE ContactInformation 
                SET 
                    MainPhone = ?,
                    FaxNumber = ?,
                    MainEmail = ?
                WHERE KPMDealerNumber = ?
            `, [
                updatedDealer.contact.MainPhone,
                updatedDealer.contact.FaxNumber,
                updatedDealer.contact.MainEmail,
                dealerNumber
            ]);
        }
        console.log('Contact update completed');

        // Update LinesCarried
        await promisePool.query('DELETE FROM LinesCarried WHERE KPMDealerNumber = ?', [dealerNumber]);
        
        if (updatedDealer.lines && updatedDealer.lines.length > 0) {
            for (const line of updatedDealer.lines) {
                await promisePool.query(`
                    INSERT INTO LinesCarried (KPMDealerNumber, LineName, AccountNumber)
                    VALUES (?, ?, ?)
                `, [dealerNumber, line.LineName, line.AccountNumber]);
            }
        }

        // Update Salesman if provided
        if (updatedDealer.salesman && updatedDealer.salesman.SalesmanCode) {
            await promisePool.query(`
                UPDATE Dealerships 
                SET SalesmanCode = ?
                WHERE KPMDealerNumber = ?
            `, [updatedDealer.salesman.SalesmanCode, dealerNumber]);
        }

        // After all updates, fetch the complete updated data using the same structure as GET
        const [dealerInfo] = await promisePool.query(`
            SELECT 
                d.KPMDealerNumber,
                d.DealershipName,
                d.DBA,
                d.SalesmanCode,
                s.SalesmanName
            FROM Dealerships d
            LEFT JOIN Salesman s ON d.SalesmanCode = s.SalesmanCode
            WHERE d.KPMDealerNumber = ?
        `, [dealerNumber]);

        const [address] = await promisePool.query(`
            SELECT 
                StreetAddress,
                BoxNumber,
                City,
                State,
                ZipCode,
                County
            FROM Addresses 
            WHERE KPMDealerNumber = ?
        `, [dealerNumber]);

        const [contact] = await promisePool.query(`
            SELECT 
                MainPhone,
                FaxNumber,
                MainEmail
            FROM ContactInformation 
            WHERE KPMDealerNumber = ?
        `, [dealerNumber]);

        const [lines] = await promisePool.query(`
            SELECT 
                LineName,
                AccountNumber
            FROM LinesCarried 
            WHERE KPMDealerNumber = ?
        `, [dealerNumber]);

        // Structure the response exactly like GET
        const updatedDetails = {
            KPMDealerNumber: dealerInfo[0].KPMDealerNumber,
            DealershipName: dealerInfo[0].DealershipName,
            DBA: dealerInfo[0].DBA || '',
            address: address[0] || {
                StreetAddress: '',
                BoxNumber: '',
                City: '',
                State: '',
                ZipCode: '',
                County: ''
            },
            contact: contact[0] || {
                MainPhone: '',
                FaxNumber: '',
                MainEmail: ''
            },
            lines: lines || [],
            salesman: {
                SalesmanName: dealerInfo[0].SalesmanName || '',
                SalesmanCode: dealerInfo[0].SalesmanCode || ''
            }
        };

        console.log('=== FINAL RESPONSE ===');
        console.log(JSON.stringify(updatedDetails, null, 2));
        res.json(updatedDetails);

    } catch (error) {
        console.error('=== ERROR ===');
        console.error('Detailed error:', error);
        res.status(500).json({ 
            error: 'Failed to update dealer',
            details: error.message 
        });
    }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});