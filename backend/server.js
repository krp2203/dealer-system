require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const axios = require('axios');

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
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectTimeout: 30000,
    ssl: false
};

// Add debug logging
console.log('Attempting to connect to database with config:', {
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        database: dbConfig.database
    });

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// Get list of all dealers
app.get('/api/dealers', async (req, res) => {
    console.log('Received request for dealers');
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log('Database connected successfully');

        const [rows] = await connection.query(`
            SELECT DISTINCT 
                d.KPMDealerNumber,
                d.DealershipName,
                d.DBA,
                d.SalesmanCode,
                s.SalesmanName
            FROM Dealerships d
            LEFT JOIN Salesman s ON d.SalesmanCode = s.SalesmanCode
            ORDER BY d.DealershipName
        `);

        console.log(`Successfully fetched ${rows.length} dealers`);
        // Log a few rows to verify salesman data
        console.log('Sample dealers:', rows.slice(0, 3));
        
        res.json(rows);
    } catch (error) {
        console.error('Database error:', error);
            res.status(500).json({ 
            error: 'Failed to fetch dealers',
            details: error.message,
            code: error.code
        });
    } finally {
        if (connection) {
            await connection.end();
        }
    }
});

// Get complete dealer details by dealer number
app.get('/api/dealers/coordinates', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        
        console.log('Fetching dealer coordinates...');
        
        // Update query to get all dealers with coordinates
        const [dealers] = await connection.query(`
            SELECT 
                d.KPMDealerNumber,
                d.DealershipName,
                d.DBA,
                d.SalesmanCode,
                s.SalesmanName,
                a.StreetAddress,
                CASE 
                    WHEN a.City LIKE '% VA %' THEN SUBSTRING_INDEX(a.City, ' VA ', 1)
                    ELSE a.City 
                END as City,
                COALESCE(a.State, 
                    CASE 
                        WHEN a.City LIKE '% VA %' THEN 'VA'
                        WHEN a.City LIKE '% NC %' THEN 'NC'
                        ELSE ''
                    END
                ) as State,
                COALESCE(a.ZipCode,
                    CASE 
                        WHEN a.City LIKE '% VA %' THEN TRIM(SUBSTRING_INDEX(a.City, ' VA ', -1))
                        WHEN a.City LIKE '% NC %' THEN TRIM(SUBSTRING_INDEX(a.City, ' NC ', -1))
                        ELSE ''
                    END
                ) as ZipCode,
                CAST(a.lat AS DECIMAL(10,8)) as lat,
                CAST(a.lng AS DECIMAL(11,8)) as lng
            FROM Dealerships d
            LEFT JOIN Salesman s ON d.SalesmanCode = s.SalesmanCode
            LEFT JOIN Addresses a ON d.KPMDealerNumber = a.KPMDealerNumber
            WHERE a.StreetAddress IS NOT NULL
        `);

        console.log(`Found ${dealers.length} dealers with coordinates`);
        if (dealers.length > 0) {
            console.log('Sample dealer:', {
                name: dealers[0].DealershipName,
                address: dealers[0].StreetAddress,
                coordinates: {
                    lat: dealers[0].lat,
                    lng: dealers[0].lng
                }
            });
        }
        
        res.json(dealers);
    } catch (error) {
        console.error('Error fetching dealer coordinates:', error);
        res.status(500).json({ 
            error: 'Failed to fetch dealer coordinates',
            details: error.message 
        });
    } finally {
        if (connection) {
            await connection.end();
        }
    }
});

// Get complete dealer details by dealer number
app.get('/api/dealers/:dealerNumber', async (req, res) => {
    let connection;
    try {
        console.log('=== GET DEALER DETAILS ===');
        console.log('Dealer Number:', req.params.dealerNumber);

        // Create connection
        connection = await mysql.createConnection(dbConfig);

        // Get dealer basic info with salesman details
        const [dealerInfo] = await connection.query(`
            SELECT 
                d.KPMDealerNumber,
                d.DealershipName,
                d.DBA,
                COALESCE(d.SalesmanCode, '') as SalesmanCode,
                COALESCE(s.SalesmanName, '') as SalesmanName,
                s.SalesmanCode as ConfirmedSalesmanCode
            FROM Dealerships d
            LEFT JOIN Salesman s ON d.SalesmanCode = s.SalesmanCode
            WHERE d.KPMDealerNumber = ?
        `, [req.params.dealerNumber]);

        if (dealerInfo.length === 0) {
            return res.status(404).json({ error: 'Dealer not found' });
        }

        // Get address information
        const [address] = await connection.query(`
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
        const [contact] = await connection.query(`
            SELECT 
                MainPhone,
                FaxNumber,
                MainEmail
            FROM ContactInformation 
            WHERE KPMDealerNumber = ?
        `, [req.params.dealerNumber]);

   
        // Get lines carried
        const [lines] = await connection.query(`
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
            res.status(500).json({ 
            error: 'Failed to fetch dealer details',
            details: error.message,
            code: error.code
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

// Add a root route
app.get('/', (req, res) => {
    res.json({ message: 'KPM Dealer Database API' });
});

// Add this endpoint for updating dealer details
app.put('/api/dealers/:dealerNumber', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const dealerNumber = req.params.dealerNumber;
        const updates = req.body;

        // Update basic info
        await connection.query(`
            UPDATE Dealerships 
            SET DBA = ?
            WHERE KPMDealerNumber = ?
        `, [updates.DBA, dealerNumber]);

        // Update contact info
        await connection.query(`
            UPDATE ContactInformation 
            SET MainPhone = ?, FaxNumber = ?, MainEmail = ?
            WHERE KPMDealerNumber = ?
        `, [updates.contact.MainPhone, updates.contact.FaxNumber, updates.contact.MainEmail, dealerNumber]);

        // Update address
        await connection.query(`
            UPDATE Addresses 
            SET StreetAddress = ?, BoxNumber = ?, City = ?, State = ?, ZipCode = ?, County = ?
            WHERE KPMDealerNumber = ?
        `, [
            updates.address.StreetAddress,
            updates.address.BoxNumber,
            updates.address.City,
            updates.address.State,
            updates.address.ZipCode,
            updates.address.County,
            dealerNumber
        ]);

        // Fetch and return the complete updated dealer details
        const [dealerInfo] = await connection.query(`
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

        const [address] = await connection.query(`
            SELECT * FROM Addresses WHERE KPMDealerNumber = ?
        `, [dealerNumber]);

        const [contact] = await connection.query(`
            SELECT * FROM ContactInformation WHERE KPMDealerNumber = ?
        `, [dealerNumber]);

        const [lines] = await connection.query(`
            SELECT * FROM LinesCarried WHERE KPMDealerNumber = ?
        `, [dealerNumber]);

        // Return the complete dealer details
        const updatedDealer = {
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

        res.json(updatedDealer);
    } catch (error) {
        console.error('Error updating dealer:', error);
        res.status(500).json({ error: 'Failed to update dealer details' });
    } finally {
        if (connection) await connection.end();
    }
});

// Add import endpoint
app.post('/api/import', async (req, res) => {
    let connection;
    try {
        const { headers, rows } = req.body;
        
        console.log('=== IMPORT STARTED ===');
        // Log the exact column names we're looking for
        console.log('Column indexes:', {
            dealerNumber: headers.indexOf('KPM Dealer Number'),
            streetAddress: headers.indexOf('Street Address'),
            city: headers.indexOf('City'),
            state: headers.indexOf('State'),
            zipCode: headers.indexOf('Zip Code'),
            salesmanCode: headers.indexOf('Salesman Code')
        });

        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction();

        let processedCount = 0;
        let updatedCount = 0;
        let errorCount = 0;
        let addressCount = 0;

        for (const row of rows) {
            try {
                const dealerNumber = row[headers.indexOf('KPM Dealer Number')]?.toString().trim();
                
                // Process all rows, even if dealer number is empty
                const dealerData = {
                    dealerNumber: dealerNumber || '',
                    dealershipName: row[headers.indexOf('Dealership Name')]?.toString().trim() || '',
                    dba: row[headers.indexOf('DBA')]?.toString().trim() || '',
                    salesmanCode: row[headers.indexOf('Salesman Code')]?.toString().trim() || null,
                    streetAddress: row[headers.indexOf('Street Address')]?.toString().trim() || '',
                    city: row[headers.indexOf('City')]?.toString().trim() || '',
                    state: row[headers.indexOf('State')]?.toString().trim() || '',
                    zipCode: row[headers.indexOf('Zip Code')]?.toString().trim() || ''
                };

                console.log('Processing dealer:', dealerData);

                // Insert/update dealer info for all rows
                if (dealerData.dealerNumber) {
                    await connection.query(`
                        INSERT INTO Dealerships 
                            (KPMDealerNumber, DealershipName, DBA, SalesmanCode)
                        VALUES (?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                            DealershipName = VALUES(DealershipName),
                            DBA = VALUES(DBA),
                            SalesmanCode = ?
                    `, [
                        dealerData.dealerNumber,
                        dealerData.dealershipName,
                        dealerData.dba,
                        dealerData.salesmanCode,
                        dealerData.salesmanCode
                    ]);

                    // Process address if we have the required fields
                    if (dealerData.streetAddress && dealerData.city && dealerData.state) {
                        const fullAddress = `${dealerData.streetAddress}, ${dealerData.city}, ${dealerData.state} ${dealerData.zipCode}`;
                        console.log('Processing address:', fullAddress);

                        try {
                            const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&key=${GOOGLE_MAPS_API_KEY}`;
                            const geocodeResponse = await axios.get(geocodeUrl);
                            
                            if (geocodeResponse.data.results && geocodeResponse.data.results[0]) {
                                const location = geocodeResponse.data.results[0].geometry.location;
                                
                                await connection.query(`
                                    INSERT INTO Addresses 
                                        (KPMDealerNumber, StreetAddress, City, State, ZipCode, Latitude, Longitude)
                                    VALUES (?, ?, ?, ?, ?, ?, ?)
                                    ON DUPLICATE KEY UPDATE
                                        StreetAddress = VALUES(StreetAddress),
                                        City = VALUES(City),
                                        State = VALUES(State),
                                        ZipCode = VALUES(ZipCode),
                                        Latitude = VALUES(Latitude),
                                        Longitude = VALUES(Longitude)
                                `, [
                                    dealerData.dealerNumber,
                                    dealerData.streetAddress,
                                    dealerData.city,
                                    dealerData.state,
                                    dealerData.zipCode,
                                    location.lat,
                                    location.lng
                                ]);
                                addressCount++;
                            }
                        } catch (geocodeError) {
                            console.error('Geocoding error for address:', fullAddress, geocodeError);
                        }
                    }

                    updatedCount++;
                }
                
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
        if (connection) {
            await connection.rollback();
        }
        res.status(500).json({
            error: 'Failed to import data',
            details: error.message
        });
    } finally {
        if (connection) {
            await connection.end();
        }
    }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});