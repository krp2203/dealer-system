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

// Add this function at the top with other imports
const geocodeAddress = async (address) => {
    try {
        console.log('Geocoding address:', address);
        const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
            params: {
                address: address,
                key: GOOGLE_MAPS_API_KEY
            }
        });

        if (response.data.results && response.data.results.length > 0) {
            const location = response.data.results[0].geometry.location;
            console.log('Geocoding successful:', {
                address: address,
                coordinates: location
            });
            return {
                lat: location.lat,
                lng: location.lng
            };
        }
        console.warn('No geocoding results for address:', address);
        return null;
    } catch (error) {
        console.error('Geocoding error:', {
            address: address,
            error: error.message
        });
        return null;
    }
};

// Add this function near the top with other functions
async function migrateSalesmanData(connection) {
    try {
        // Check if there's data to migrate
        const [dealers] = await connection.query(`
            SELECT KPMDealerNumber, SalesmanCode 
            FROM Dealerships 
            WHERE SalesmanCode IS NOT NULL AND SalesmanCode != ''
        `);

        if (dealers.length > 0) {
            console.log(`Found ${dealers.length} dealers with salesman data to migrate`);
            
            // Insert existing relationships into DealerSalesmen
            for (const dealer of dealers) {
                await connection.query(`
                    INSERT IGNORE INTO DealerSalesmen 
                        (KPMDealerNumber, SalesmanCode)
                    VALUES (?, ?)
                `, [dealer.KPMDealerNumber, dealer.SalesmanCode]);
            }
            
            console.log('Salesman data migration completed');
        }
    } catch (error) {
        console.error('Error migrating salesman data:', error);
        throw error;
    }
}

// Modify the ensureDealerSalesmenTable function to include migration
async function ensureDealerSalesmenTable(connection) {
    try {
        // Check if table exists first
        const [tables] = await connection.query(`
            SELECT TABLE_NAME 
            FROM information_schema.TABLES 
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'DealerSalesmen'
        `, [process.env.DB_NAME]);

        const tableExists = tables.length > 0;

        if (!tableExists) {
            // Create the table if it doesn't exist
            await connection.query(`
                CREATE TABLE IF NOT EXISTS DealerSalesmen (
                    KPMDealerNumber VARCHAR(255),
                    SalesmanCode VARCHAR(255),
                    PRIMARY KEY (KPMDealerNumber, SalesmanCode),
                    FOREIGN KEY (KPMDealerNumber) REFERENCES Dealerships(KPMDealerNumber),
                    FOREIGN KEY (SalesmanCode) REFERENCES Salesman(SalesmanCode)
                )
            `);
            console.log('DealerSalesmen table created');

            // Migrate existing data
            await migrateSalesmanData(connection);
        }
    } catch (error) {
        console.error('Error creating/migrating DealerSalesmen table:', error);
        throw error;
    }
}

// Get list of all dealers
app.get('/api/dealers', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        
        const [rows] = await connection.query(`
            SELECT DISTINCT 
                d.KPMDealerNumber,
                d.DealershipName,
                d.DBA,
                GROUP_CONCAT(DISTINCT ds.SalesmanCode) as SalesmanCodes,
                GROUP_CONCAT(DISTINCT s.SalesmanName) as SalesmanNames,
                c.MainPhone
            FROM Dealerships d
            LEFT JOIN DealerSalesmen ds ON d.KPMDealerNumber = ds.KPMDealerNumber
            LEFT JOIN Salesman s ON ds.SalesmanCode = s.SalesmanCode
            LEFT JOIN ContactInformation c ON d.KPMDealerNumber = c.KPMDealerNumber
            GROUP BY d.KPMDealerNumber, d.DealershipName, d.DBA, c.MainPhone
            ORDER BY d.DealershipName
        `);

        res.json(rows);
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Failed to fetch dealers' });
    } finally {
        if (connection) await connection.end();
    }
});

// Get complete dealer details by dealer number
app.get('/api/dealers/coordinates', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        
        const [dealers] = await connection.query(`
            SELECT 
                d.KPMDealerNumber,
                d.DealershipName,
                d.DBA,
                ds.SalesmanCode,
                s.SalesmanName,
                a.StreetAddress,
                a.City,
                a.State,
                a.ZipCode,
                CAST(a.lat AS DECIMAL(10,8)) as lat,
                CAST(a.lng AS DECIMAL(11,8)) as lng
            FROM Dealerships d
            LEFT JOIN DealerSalesmen ds ON d.KPMDealerNumber = ds.KPMDealerNumber
            LEFT JOIN Salesman s ON ds.SalesmanCode = s.SalesmanCode
            LEFT JOIN Addresses a ON d.KPMDealerNumber = a.KPMDealerNumber
            WHERE a.lat IS NOT NULL AND a.lng IS NOT NULL
        `);
        
        res.json(dealers);
    } catch (error) {
        console.error('Error fetching coordinates:', error);
        res.status(500).json({ error: 'Failed to fetch dealer coordinates' });
    } finally {
        if (connection) await connection.end();
    }
});

// Get complete dealer details by dealer number
app.get('/api/dealers/:dealerNumber', async (req, res) => {
    let connection;
    try {
        console.log('Fetching dealer details for:', req.params.dealerNumber);
        connection = await mysql.createConnection(dbConfig);

        // Debug query to check table structure and data
        const [tableInfo] = await connection.query(`
            DESCRIBE LinesCarried
        `);
        console.log('LinesCarried table structure:', tableInfo);

        // Check if we have any lines data at all
        const [allLines] = await connection.query(`
            SELECT * FROM LinesCarried LIMIT 5
        `);
        console.log('Sample lines data:', allLines);

        // Get lines for specific dealer with detailed logging
        const [lines] = await connection.query(`
            SELECT LineName, AccountNumber
            FROM LinesCarried 
            WHERE KPMDealerNumber = ?
        `, [req.params.dealerNumber]);

        console.log('Lines for dealer:', {
            dealerNumber: req.params.dealerNumber,
            count: lines.length,
            lines: JSON.stringify(lines, null, 2)
        });

        // Get dealer basic info
        const [dealerInfo] = await connection.query(`
            SELECT 
                d.KPMDealerNumber,
                d.DealershipName,
                d.DBA
            FROM Dealerships d
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
                MainEmail,
                SecondEmail,
                ThirdEmail,
                FourthEmail,
                FifthEmail
            FROM ContactInformation 
            WHERE KPMDealerNumber = ?
        `, [req.params.dealerNumber]);

   
        // Modify the dealer details query
        let salesmen = [];
        try {
            // Get salesmen from both old and new structures
            const [allSalesmen] = await connection.query(`
                SELECT DISTINCT 
                    s.SalesmanCode,
                    s.SalesmanName
                FROM DealerSalesmen ds
                JOIN Salesman s ON ds.SalesmanCode = s.SalesmanCode
                WHERE ds.KPMDealerNumber = ?
            `, [req.params.dealerNumber]);
            
            salesmen = allSalesmen;
            console.log('Found salesmen:', salesmen);
        } catch (error) {
            console.error('Error fetching salesmen:', error);
            salesmen = []; // Default to empty array if there's an error
        }

        // Structure the response with explicit lines data
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
            lines: lines.map(line => ({
                LineName: line.LineName,
                AccountNumber: line.AccountNumber
            })),
            salesman: {
                SalesmanName: salesmen[0]?.SalesmanName || '',
                SalesmanCode: salesmen[0]?.SalesmanCode || ''
            },
            salesmen: salesmen.map(s => ({
                SalesmanName: s.SalesmanName,
                SalesmanCode: s.SalesmanCode
            }))
        };

        console.log('Sending dealer details with lines:', {
            dealerNumber: req.params.dealerNumber,
            lineCount: dealerDetails.lines.length,
            lines: dealerDetails.lines
        });

        res.json(dealerDetails);

    } catch (error) {
        console.error('Error fetching dealer details:', error);
        res.status(500).json({ error: 'Failed to fetch dealer details' });
    } finally {
        if (connection) await connection.end();
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
            lines: lines[0]?.LineName || '',
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
    let stats = {
        processedCount: 0,
        updatedCount: 0,
        errorCount: 0,
        newDealersCount: 0
    };
    let currentDealerNumber = null;

    try {
        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction();
        
        // Ensure the DealerSalesmen table exists
        await ensureDealerSalesmenTable(connection);

        const { headers, rows } = req.body;

        for (const row of rows) {
            try {
                currentDealerNumber = row[headers.indexOf('KPM Dealer Number')]?.toString().trim();
                if (!currentDealerNumber) {
                    console.log('Skipping row - no dealer number');
                    continue;
                }

                // First check if dealer exists
                const [existingDealer] = await connection.query(
                    'SELECT KPMDealerNumber FROM Dealerships WHERE KPMDealerNumber = ?',
                    [currentDealerNumber]
                );

                if (existingDealer.length === 0) {
                    // Create new dealer
                    console.log(`Creating new dealer: ${currentDealerNumber}`);
                    
                    await connection.query(`
                        INSERT INTO Dealerships 
                            (KPMDealerNumber, DealershipName)
                        VALUES (?, ?)
                    `, [
                        currentDealerNumber,
                        row[headers.indexOf('Dealership Name')]?.toString().trim() || 'Unknown'
                    ]);
                } else {
                    // Update existing dealer
                    console.log(`Updating existing dealer: ${currentDealerNumber}`);
                    
                    await connection.query(`
                        UPDATE Dealerships 
                        SET DealershipName = ?
                        WHERE KPMDealerNumber = ?
                    `, [
                        row[headers.indexOf('Dealership Name')]?.toString().trim() || 'Unknown',
                        currentDealerNumber
                    ]);
                }

                // Handle salesman assignment
                const salesmanCode = row[headers.indexOf('Salesman Code')]?.toString().trim() || 
                                    row[headers.indexOf('SalesmanCode')]?.toString().trim() || 
                                    row[headers.indexOf('Rep Code')]?.toString().trim();

                if (salesmanCode) {
                    console.log(`Processing salesman assignment for dealer ${currentDealerNumber}:`, {
                        salesmanCode,
                        existingSalesmen: await connection.query(`
                            SELECT SalesmanCode 
                            FROM DealerSalesmen 
                            WHERE KPMDealerNumber = ?
                        `, [currentDealerNumber])
                    });

                    // Check existing assignments
                    const [existingAssignment] = await connection.query(`
                        SELECT SalesmanCode 
                        FROM DealerSalesmen 
                        WHERE KPMDealerNumber = ? AND SalesmanCode = ?
                    `, [currentDealerNumber, salesmanCode]);

                    if (existingAssignment.length === 0) {
                        // Insert new salesman relationship
                        await connection.query(`
                            INSERT INTO DealerSalesmen 
                                (KPMDealerNumber, SalesmanCode)
                            VALUES (?, ?)
                        `, [
                            currentDealerNumber,
                            salesmanCode
                        ]);
                        console.log(`Added new salesman ${salesmanCode} to dealer ${currentDealerNumber}`);
                    } else {
                        console.log(`Salesman ${salesmanCode} already assigned to dealer ${currentDealerNumber}`);
                    }
                }

                // Handle address for both new and existing dealers
                const streetAddress = row[headers.indexOf('Street Address')]?.toString().trim();
                const city = row[headers.indexOf('City')]?.toString().trim();
                const state = row[headers.indexOf('State')]?.toString().trim();
                const zipCode = row[headers.indexOf('Zip Code')]?.toString().trim();
                const county = row[headers.indexOf('County')]?.toString().trim();

                // Geocode the address
                const fullAddress = `${streetAddress}, ${city}, ${state} ${zipCode}`;
                const coordinates = await geocodeAddress(fullAddress);

                // Insert or update address
                await connection.query(`
                    INSERT INTO Addresses 
                        (KPMDealerNumber, StreetAddress, City, State, ZipCode, County, lat, lng)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        StreetAddress = VALUES(StreetAddress),
                        City = VALUES(City),
                        State = VALUES(State),
                        ZipCode = VALUES(ZipCode),
                        County = VALUES(County),
                        lat = VALUES(lat),
                        lng = VALUES(lng)
                `, [
                    currentDealerNumber,
                    streetAddress,
                    city,
                    state,
                    zipCode,
                    county,
                    coordinates?.lat || null,
                    coordinates?.lng || null
                ]);

                // Handle Lines Carried
                const linesCarried = row[headers.indexOf('Lines Carried')]?.toString().trim();
                if (linesCarried) {
                    await connection.query(`
                        INSERT INTO LinesCarried 
                            (KPMDealerNumber, LineName)
                        VALUES (?, ?)
                        ON DUPLICATE KEY UPDATE
                            LineName = VALUES(LineName)
                    `, [
                        currentDealerNumber,
                        linesCarried
                    ]);
                }

                // Handle Contact Information
                await connection.query(`
                    INSERT INTO ContactInformation 
                        (KPMDealerNumber, MainPhone, FaxNumber, MainEmail)
                    VALUES (?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        MainPhone = VALUES(MainPhone),
                        FaxNumber = VALUES(FaxNumber),
                        MainEmail = VALUES(MainEmail)
                `, [
                    currentDealerNumber,
                    row[headers.indexOf('Main Phone')]?.toString().trim(),
                    row[headers.indexOf('Fax Number')]?.toString().trim(),
                    row[headers.indexOf('Main Email')]?.toString().trim()
                ]);

                console.log(`Successfully processed dealer: ${currentDealerNumber}`);
                stats.processedCount++;
                stats.updatedCount++;

            } catch (error) {
                console.error('Error processing dealer:', {
                    dealerNumber: currentDealerNumber,
                    error: error.message,
                    stack: error.stack
                });
                stats.errorCount++;
            }
        }

        await connection.commit();
        console.log('Import completed with stats:', stats);
            
            res.json({ 
            success: true,
            message: 'Import completed successfully',
            stats: stats
        });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Import failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to import data',
            details: error.message,
            stats: stats
        });
    } finally {
        if (connection) await connection.end();
    }
});

// Add this new endpoint for additional dealer data
app.get('/api/dealers/:dealerNumber/details', async (req, res) => {
    let connection;
    try {
        console.log('Fetching additional dealer details for:', req.params.dealerNumber);
        
        connection = await mysql.createConnection(dbConfig);
        
        // Get contact information
        const [contact] = await connection.query(`
            SELECT 
                MainPhone,
                FaxNumber,
                MainEmail,
                SecondEmail,
                ThirdEmail,
                FourthEmail,
                FifthEmail
            FROM ContactInformation 
            WHERE KPMDealerNumber = ?
        `, [req.params.dealerNumber]);

        // Get lines carried
        const [lines] = await connection.query(`
            SELECT LineName
            FROM LinesCarried 
            WHERE KPMDealerNumber = ?
        `, [req.params.dealerNumber]);

        // Get county information
        const [address] = await connection.query(`
            SELECT County
            FROM Addresses 
            WHERE KPMDealerNumber = ?
        `, [req.params.dealerNumber]);

        // Combine all the additional information
        const additionalDetails = {
            contact: contact[0] || {
                MainPhone: '',
                FaxNumber: '',
                MainEmail: '',
                SecondEmail: '',
                ThirdEmail: '',
                FourthEmail: '',
                FifthEmail: ''
            },
            linesCarried: lines[0]?.LineName || '',
            county: address[0]?.County || ''
        };

        console.log('Additional details found:', additionalDetails);
        res.json(additionalDetails);

    } catch (error) {
        console.error('Error fetching additional dealer details:', error);
        res.status(500).json({ 
            error: 'Failed to fetch additional dealer details',
            details: error.message 
        });
    } finally {
        if (connection) await connection.end();
    }
});

// Add search endpoint
app.get('/api/dealers/search', async (req, res) => {
    const searchTerm = req.query.term?.toLowerCase();
    if (!searchTerm) {
        return res.json([]);
    }

    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        
        const [rows] = await connection.query(`
            SELECT DISTINCT 
                d.KPMDealerNumber,
                d.DealershipName,
                d.DBA
            FROM Dealerships d
            LEFT JOIN Addresses a ON d.KPMDealerNumber = a.KPMDealerNumber
            LEFT JOIN ContactInformation c ON d.KPMDealerNumber = c.KPMDealerNumber
            LEFT JOIN DealerSalesmen ds ON d.KPMDealerNumber = ds.KPMDealerNumber
            LEFT JOIN Salesman s ON ds.SalesmanCode = s.SalesmanCode
            WHERE 
                d.KPMDealerNumber LIKE ? OR
                d.DealershipName LIKE ? OR
                d.DBA LIKE ? OR
                a.StreetAddress LIKE ? OR
                a.City LIKE ? OR
                a.State LIKE ? OR
                a.ZipCode LIKE ? OR
                c.MainPhone LIKE ? OR
                c.FaxNumber LIKE ? OR
                c.MainEmail LIKE ? OR
                s.SalesmanName LIKE ?
            ORDER BY d.DealershipName
        `, Array(11).fill(`%${searchTerm}%`));

        console.log(`Search found ${rows.length} results for "${searchTerm}"`);
        res.json(rows);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Search failed' });
    } finally {
        if (connection) await connection.end();
    }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});