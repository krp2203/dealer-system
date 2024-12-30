require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const axios = require('axios');
const { promisify } = require('util');
const sleep = promisify(setTimeout);

const app = express();
app.use(express.json());
app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://35.212.41.99:3000',
        'https://35.212.41.99:3000'
    ],
    methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: true
}));

const dbConfig = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectTimeout: 30000,
    ssl: false
};

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

console.log('Google Maps API Key configured:', GOOGLE_MAPS_API_KEY ? 'Yes' : 'No');

// Debug endpoint to check incoming data
app.post('/api/debug-import', async (req, res) => {
    const { headers, rows } = req.body;
    console.log('=== DEBUG IMPORT ===');
    console.log('Headers:', headers);
    console.log('First row:', rows[0]);
    console.log('Row count:', rows.length);
    res.json({ received: true });
});

// Get list of all dealers
app.get('/api/dealers', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log('Database connected for dealer fetch');
        
        const [rows] = await connection.query(`
            SELECT DISTINCT 
                d.KPMDealerNumber,
                d.DealershipName,
                d.DBA,
                d.SalesmanCode,
                s.SalesmanName,
                a.StreetAddress,
                a.City,
                a.State,
                a.ZipCode,
                COALESCE(a.Latitude, a.lat) as Latitude,
                COALESCE(a.Longitude, a.lng) as Longitude
            FROM Dealerships d
            LEFT JOIN Salesman s ON d.SalesmanCode = s.SalesmanCode
            LEFT JOIN Addresses a ON d.KPMDealerNumber = a.KPMDealerNumber
            WHERE COALESCE(a.Latitude, a.lat) IS NOT NULL 
            AND COALESCE(a.Longitude, a.lng) IS NOT NULL
            ORDER BY d.DealershipName
        `);

        console.log(`Found ${rows.length} dealers with coordinates`);
        if (rows.length > 0) {
            console.log('Sample dealer:', {
                name: rows[0].DealershipName,
                lat: rows[0].Latitude,
                lng: rows[0].Longitude
            });
        }
        
        res.json(rows);
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch dealers',
            details: error.message,
            stack: error.stack
        });
    } finally {
        if (connection) {
            try {
                await connection.end();
                console.log('Database connection closed');
            } catch (err) {
                console.error('Error closing connection:', err);
            }
        }
    }
});

// Import dealers
app.post('/api/import', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        
        // Check existing columns
        const [columns] = await connection.query(`
            SHOW COLUMNS FROM Addresses 
            WHERE Field IN ('lat', 'lng')
        `);
        
        // We'll use the existing lat/lng columns since they're already working
        console.log('Using existing coordinate columns:', columns);

        const { headers, rows } = req.body;
        
        console.log('=== IMPORT STARTED ===');
        console.log('Column indexes:', {
            dealerNumber: headers.indexOf('KPM Dealer Number'),
            dealershipName: headers.indexOf('Dealership Name'),
            streetAddress: headers.indexOf('Street Address'),
            city: headers.indexOf('City'),
            state: headers.indexOf('State'),
            zipCode: headers.indexOf('Zip Code'),
            salesmanCode: headers.indexOf('Salesman Code')
        });

        await connection.beginTransaction();

        let processedCount = 0;
        let updatedCount = 0;
        let errorCount = 0;
        let addressCount = 0;

        for (const row of rows) {
            try {
                const dealerData = {
                    dealerNumber: row[headers.indexOf('KPM Dealer Number')]?.toString().trim() || '',
                    dealershipName: row[headers.indexOf('Dealership Name')]?.toString().trim() || '',
                    dba: row[headers.indexOf('DBA')]?.toString().trim() || '',
                    salesmanCode: row[headers.indexOf('Salesman Code')]?.toString().trim() || null,
                    streetAddress: row[headers.indexOf('Street Address')]?.toString().trim() || '',
                    city: row[headers.indexOf('City')]?.toString().trim() || '',
                    state: row[headers.indexOf('State')]?.toString().trim() || '',
                    zipCode: row[headers.indexOf('Zip Code')]?.toString().trim() || ''
                };

                if (!dealerData.dealerNumber) continue;

                console.log('Processing dealer:', dealerData);

                // Update dealer info
                await connection.query(`
                    INSERT INTO Dealerships 
                        (KPMDealerNumber, DealershipName, DBA, SalesmanCode)
                    VALUES (?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        DealershipName = VALUES(DealershipName),
                        DBA = VALUES(DBA),
                        SalesmanCode = VALUES(SalesmanCode)
                `, [
                    dealerData.dealerNumber,
                    dealerData.dealershipName,
                    dealerData.dba,
                    dealerData.salesmanCode
                ]);

                // Update address if we have all required fields
                if (dealerData.streetAddress && dealerData.city && dealerData.state) {
                    const fullAddress = `${dealerData.streetAddress}, ${dealerData.city}, ${dealerData.state} ${dealerData.zipCode}`;
                    console.log('Processing address:', fullAddress);

                    try {
                        // Add delay between requests to avoid rate limiting
                        await sleep(200); // 200ms delay between requests

                        const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&key=${GOOGLE_MAPS_API_KEY}`;
                        
                        const geocodeResponse = await axios.get(geocodeUrl);
                        
                        if (geocodeResponse.data.status === 'OK' && geocodeResponse.data.results?.[0]?.geometry?.location) {
                            const { lat, lng } = geocodeResponse.data.results[0].geometry.location;
                            console.log('Got coordinates for', dealerData.dealerNumber, ':', { lat, lng });
                            
                            await connection.query(`
                                INSERT INTO Addresses 
                                    (KPMDealerNumber, StreetAddress, City, State, ZipCode, lat, lng)
                                VALUES (?, ?, ?, ?, ?, ?, ?)
                                ON DUPLICATE KEY UPDATE
                                    StreetAddress = VALUES(StreetAddress),
                                    City = VALUES(City),
                                    State = VALUES(State),
                                    ZipCode = VALUES(ZipCode),
                                    lat = VALUES(lat),
                                    lng = VALUES(lng)
                            `, [
                                dealerData.dealerNumber,
                                dealerData.streetAddress,
                                dealerData.city,
                                dealerData.state,
                                dealerData.zipCode,
                                lat,
                                lng
                            ]);
                            
                            // Verify the update
                            const [verifyResult] = await connection.query(
                                'SELECT * FROM Addresses WHERE KPMDealerNumber = ?',
                                [dealerData.dealerNumber]
                            );
                            console.log('Address verification:', verifyResult[0]);
                            
                            addressCount++;
                        } else {
                            console.log('Geocoding failed for address:', fullAddress);
                            console.log('Status:', geocodeResponse.data.status);
                            console.log('Error message:', geocodeResponse.data.error_message);
                        }
                    } catch (geocodeError) {
                        console.error('Geocoding error for', dealerData.dealerNumber, ':', {
                            error: geocodeError.message,
                            status: geocodeError.response?.status,
                            data: geocodeError.response?.data
                        });
                    }
                }

                updatedCount++;
                processedCount++;
            } catch (error) {
                console.error('Error processing row:', error);
                errorCount++;
            }
        }

        await connection.commit();
        
        const response = {
            message: 'Import completed',
            stats: {
                processed: processedCount,
                updated: updatedCount,
                addressesProcessed: addressCount,
                errors: errorCount
            }
        };
        
        console.log('Import results:', response);
        res.json(response);

    } catch (error) {
        console.error('Import failed:', error);
        if (connection) await connection.rollback();
        res.status(500).json({
            error: 'Failed to import data',
            details: error.message
        });
    } finally {
        if (connection) await connection.end();
    }
});

// Test geocoding endpoint
app.get('/api/test-geocoding', async (req, res) => {
    try {
        const testAddress = '1600 Amphitheatre Parkway, Mountain View, CA';
        const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(testAddress)}&key=${GOOGLE_MAPS_API_KEY}`;
        
        console.log('Testing geocoding with URL:', geocodeUrl);
        
        const response = await axios.get(geocodeUrl);
        
        res.json({
            success: true,
            status: response.data.status,
            results: response.data.results
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            details: error.response?.data
        });
    }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});