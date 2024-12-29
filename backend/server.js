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
        
        // Validate input
        if (!headers || !rows || !Array.isArray(headers) || !Array.isArray(rows)) {
            throw new Error('Invalid input format');
        }

        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction(); // Start transaction

        // Get all valid salesman codes at the start
        const [salesmanList] = await connection.query('SELECT SalesmanCode, SalesmanName FROM Salesman');
        const validSalesmanCodes = new Map(salesmanList.map(s => [s.SalesmanCode, s.SalesmanName]));

        // Log starting import
        console.log('Starting import with headers:', headers);
        console.log('Salesman Code column index:', headers.indexOf('Salesman Code'));

        // Process each row
        for (const row of rows) {
            if (!row[0]) continue;

            // Add detailed logging for each row
            console.log('Processing row:', {
                dealerNumber: row[headers.indexOf('KPM Dealer Number')],
                salesmanCodeIndex: headers.indexOf('Salesman Code'),
                rawSalesmanCode: row[headers.indexOf('Salesman Code')],
                rowData: row
            });

            // Map column indices
            const getColumnValue = (columnName) => {
                let index = headers.indexOf(columnName);
                
                // Special handling for Salesman Code
                if (columnName === 'Salesman Code') {
                    console.log('Looking for Salesman Code:', {
                        exactMatch: index,
                        headers: headers,
                        possibleValue: row[index],
                        allHeaders: headers.join(', ')
                    });
                }
                
                const value = index >= 0 ? row[index]?.toString().trim() || '' : '';
                
                // Additional logging for salesman code
                if (columnName === 'Salesman Code') {
                    console.log('Found value:', {
                        columnName,
                        index,
                        rawValue: row[index],
                        processedValue: value
                    });
                }
                
                return value;
            };

            const dealerNumber = getColumnValue('KPM Dealer Number');
            const dealershipName = getColumnValue('Dealership Name');
            const dba = getColumnValue('DBA');
            const boxNumber = getColumnValue('Box Number');
            const streetAddress = getColumnValue('Street Address');
            const city = getColumnValue('City');
            const state = getColumnValue('State');
            const zipCode = getColumnValue('Zip Code');
            const mainPhone = getColumnValue('Main Phone');
            const faxNumber = getColumnValue('Fax Number');
            const county = getColumnValue('County');
            const mainEmail = getColumnValue('Main Email');
            let salesmanCode = getColumnValue('Salesman Code');
            console.log('Processing salesman:', {
                rawCode: salesmanCode,
                validCodes: Array.from(validSalesmanCodes.keys()),
                headers: headers
            });

            // Skip if no dealer number
            if (!dealerNumber) continue;

            // Check if the provided code is valid
            if (salesmanCode) {
                // Clean up the salesman code
                salesmanCode = salesmanCode.toString().trim();
                
                // Log the salesman code lookup
                console.log('Looking up salesman code:', salesmanCode);
                console.log('Valid codes:', Array.from(validSalesmanCodes.keys()));
                
                if (!validSalesmanCodes.has(salesmanCode)) {
                    console.warn(`Invalid salesman code ${salesmanCode} for dealer ${dealerNumber}`);
                    
                    // Try to match numeric code
                    const numericCode = salesmanCode.replace(/\D/g, '');
                    console.log('Trying numeric code:', numericCode);
                    
                    if (validSalesmanCodes.has(numericCode)) {
                        salesmanCode = numericCode;
                        console.log(`Matched salesman code ${salesmanCode} (${validSalesmanCodes.get(salesmanCode)})`);
                    } else {
                        salesmanCode = null;
                        console.log(`No valid salesman code match found for ${dealerNumber}`);
                    }
                }
            }

            // Add debug logging for salesman code
            console.log('Processing salesman code:', {
                dealerNumber,
                dealershipName,
                originalCode: getColumnValue('Salesman Code'),
                processedCode: salesmanCode,
                isValid: salesmanCode ? validSalesmanCodes.has(salesmanCode) : false
            });

            // Handle Lines Carried
            const lineColumns = {
                'Scag Account No': 'Scag',
                'Snow Way Account No': 'Snow Way',
                'Vortex Account No': 'Vortex',
                'Ybravo Account No': 'Ybravo',
                'OTR Account No.': 'OTR',
                'TY Account No': 'TY',
                'GG Account No': 'GG',
                'VK Account No': 'VK',
                'Bluebird Account No': 'Bluebird',
                'UM Account No': 'UM',
                'Wright Account No.': 'Wright'
            };

            try {
                // Inside the import loop, before the update
                console.log('Starting dealer import:', {
                    dealerNumber,
                    salesmanCode,
                    headers: headers.join(', ')
                });

                // First check if dealer exists
                const [existingDealer] = await connection.query(`
                    SELECT * FROM Dealerships WHERE KPMDealerNumber = ?
                `, [dealerNumber]);

                if (existingDealer.length > 0) {
                    // UPDATE existing dealer
                    console.log('Updating existing dealer:', {
                        dealerNumber,
                        currentSalesmanCode: existingDealer[0].SalesmanCode,
                        newSalesmanCode: salesmanCode
                    });

                    await connection.query(`
                        UPDATE Dealerships 
                        SET 
                            DealershipName = ?,
                            DBA = ?,
                            SalesmanCode = ?
                        WHERE KPMDealerNumber = ?
                    `, [dealershipName, dba, salesmanCode, dealerNumber]);
                } else {
                    // INSERT new dealer
                    console.log('Inserting new dealer:', {
                        dealerNumber,
                        salesmanCode
                    });

                    await connection.query(`
                        INSERT INTO Dealerships 
                            (KPMDealerNumber, DealershipName, DBA, SalesmanCode)
                        VALUES (?, ?, ?, ?)
                    `, [dealerNumber, dealershipName, dba, salesmanCode]);
                }

                // Verify after update
                const [verifyResult] = await connection.query(`
                    SELECT d.KPMDealerNumber, d.DealershipName, d.SalesmanCode, s.SalesmanName
                    FROM Dealerships d
                    LEFT JOIN Salesman s ON d.SalesmanCode = s.SalesmanCode
                    WHERE d.KPMDealerNumber = ?
                `, [dealerNumber]);

                console.log('Dealer after update:', verifyResult[0]);

                // Update Addresses table
                await connection.query(`
                    INSERT INTO Addresses 
                        (KPMDealerNumber, StreetAddress, BoxNumber, City, State, ZipCode, County)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        StreetAddress = VALUES(StreetAddress),
                        BoxNumber = VALUES(BoxNumber),
                        City = VALUES(City),
                        State = VALUES(State),
                        ZipCode = VALUES(ZipCode),
                        County = VALUES(County)
                `, [dealerNumber, streetAddress, boxNumber, city, state, zipCode, county]);

                // Update ContactInformation table
                await connection.query(`
                    INSERT INTO ContactInformation 
                        (KPMDealerNumber, MainPhone, FaxNumber, MainEmail)
                    VALUES (?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        MainPhone = VALUES(MainPhone),
                        FaxNumber = VALUES(FaxNumber),
                        MainEmail = VALUES(MainEmail)
                `, [dealerNumber, mainPhone, faxNumber, mainEmail]);

                // Handle Lines Carried
                await connection.query('DELETE FROM LinesCarried WHERE KPMDealerNumber = ?', [dealerNumber]);
                for (const [column, lineName] of Object.entries(lineColumns)) {
                    const accountNumber = getColumnValue(column);
                    if (accountNumber) {
                        await connection.query(`
                            INSERT INTO LinesCarried (KPMDealerNumber, LineName, AccountNumber)
                            VALUES (?, ?, ?)
                        `, [dealerNumber, lineName, accountNumber]);
                    }
                }

                // Add geocoding for new addresses
                if (streetAddress && city && state && zipCode) {
                    const address = `${streetAddress}, ${city}, ${state} ${zipCode}`;
                    try {
                        const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`;
                        const response = await axios.get(geocodeUrl);
                        
                        if (response.data.status === 'OK' && response.data.results[0]?.geometry?.location) {
                            const { lat, lng } = response.data.results[0].geometry.location;
                            
                            // Update coordinates in Addresses table
                            await connection.query(`
                                UPDATE Addresses 
                                SET lat = ?, lng = ?
                                WHERE KPMDealerNumber = ?
                            `, [lat, lng, dealerNumber]);
                            
                            console.log(`Updated coordinates for ${dealerNumber}: ${lat}, ${lng}`);
                        } else {
                            console.warn(`Failed to geocode address for dealer ${dealerNumber}: ${address}`);
                        }
                    } catch (error) {
                        console.warn(`Geocoding error for ${dealerNumber}:`, error.message);
                        // Don't throw error for geocoding failures - continue with import
                    }
                }

                // After the update
                const [result] = await connection.query(`
                    SELECT * FROM Dealerships WHERE KPMDealerNumber = ?
                `, [dealerNumber]);
                console.log('After update:', result[0]);

            } catch (error) {
                await connection.rollback();
                throw error;
            }
        }

        // Commit the transaction if everything succeeded
        await connection.commit();

        res.json({ 
            message: 'Import completed successfully',
            rowsProcessed: rows.length 
        });

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error('Import error:', error);
        res.status(500).json({ 
            error: 'Failed to import data',
            details: error.message 
        });
    } finally {
        if (connection) {
            try {
                await connection.end();
            } catch (err) {
                console.error('Error closing connection:', err);
            }
        }
    }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});