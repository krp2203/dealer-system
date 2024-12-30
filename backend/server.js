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
        
        // Find the salesman code column, accounting for misspelling
        const salesmanCodeIndex = headers.findIndex(h => 
            h === 'Salesman Code' || 
            h === 'Saelsman Code' || // Handle misspelling
            h.toLowerCase().includes('salesman') && h.toLowerCase().includes('code')
        );

        console.log('Column info:', {
            headers: headers,
            salesmanCodeIndex: salesmanCodeIndex,
            foundColumn: headers[salesmanCodeIndex]
        });

        // Get valid salesman codes from database
        const [validCodes] = await connection.query('SELECT SalesmanCode FROM Salesman');
        console.log('Valid salesman codes in database:', validCodes);

        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction();

        let processedCount = 0;
        let updatedCount = 0;
        let errorCount = 0;

        // Process each row
        for (const row of rows) {
            try {
                const dealerNumber = row[headers.indexOf('KPM Dealer Number')]?.toString().trim();
                if (!dealerNumber) continue;

                const salesmanCode = row[salesmanCodeIndex]?.toString().trim();
                
                console.log('Processing dealer:', {
                    dealerNumber,
                    salesmanCode,
                    rawValue: row[salesmanCodeIndex]
                });

                const dealerData = {
                    dealerNumber,
                    dealershipName: row[headers.indexOf('Dealership Name')]?.toString().trim(),
                    dba: row[headers.indexOf('DBA')]?.toString().trim(),
                    salesmanCode: salesmanCode || null  // Ensure null if empty
                };

                // Log the query parameters
                console.log('Updating dealer:', dealerData);

                // Explicitly update the salesman code
                await connection.query(`
                    INSERT INTO Dealerships 
                        (KPMDealerNumber, DealershipName, DBA, SalesmanCode)
                    VALUES (?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        DealershipName = VALUES(DealershipName),
                        DBA = VALUES(DBA),
                        SalesmanCode = ?  -- Explicitly set salesman code
                `, [
                    dealerNumber,
                    dealerData.dealershipName,
                    dealerData.dba || '',
                    dealerData.salesmanCode,
                    dealerData.salesmanCode  // Pass salesmanCode again for UPDATE
                ]);

                // Verify the update immediately
                const [verifyResult] = await connection.query(
                    'SELECT * FROM Dealerships WHERE KPMDealerNumber = ?',
                    [dealerNumber]
                );
                console.log('Verification after update:', {
                    dealerNumber,
                    beforeSalesmanCode: salesmanCode,
                    afterSalesmanCode: verifyResult[0]?.SalesmanCode,
                    fullRecord: verifyResult[0]
                });

                processedCount++;
                updatedCount++;
            } catch (error) {
                console.error(`Error processing row:`, {
                    row,
                    error: error.message
                });
                errorCount++;
            }
        }

        await connection.commit();
        
        console.log('=== IMPORT COMPLETED ===');
        console.log('Results:', {
            processed: processedCount,
            updated: updatedCount,
            errors: errorCount
        });
            
            res.json({ 
            message: 'Import completed successfully',
            stats: {
                processed: processedCount,
                updated: updatedCount,
                errors: errorCount
            }
        });

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