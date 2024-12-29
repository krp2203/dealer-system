require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
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

// Get list of all dealers
app.get('/api/dealers', async (req, res) => {
    console.log('Received request for dealers');
    let connection;
    try {
        console.log('Creating database connection...', {
            host: dbConfig.host,
            database: dbConfig.database,
            user: dbConfig.user
        });
        
        connection = await mysql.createConnection(dbConfig);
        console.log('Database connected successfully');

        const [rows] = await connection.query(`
            SELECT DISTINCT 
                d.KPMDealerNumber,
                d.DealershipName,
                d.DBA,
                d.SalesmanCode
            FROM Dealerships d
            ORDER BY d.DealershipName
        `);
        console.log(`Successfully fetched ${rows.length} dealers`);
        res.json(rows);
    } catch (error) {
        console.error('Database error:', error);
        console.error('Connection config:', {
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        database: dbConfig.database
    });
        res.status(500).json({ 
            error: 'Failed to fetch dealers',
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

// Get complete dealer details by dealer number
app.get('/api/dealers/coordinates', async (req, res) => {
    let connection;
    try {
        console.log('Fetching dealer coordinates...');
        connection = await mysql.createConnection(dbConfig);
        
        // First, let's check address data quality
        const [addressStats] = await connection.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN StreetAddress != '' AND StreetAddress IS NOT NULL THEN 1 END) as hasStreet,
                COUNT(CASE WHEN City != '' AND City IS NOT NULL THEN 1 END) as hasCity,
                COUNT(CASE WHEN State != '' AND State IS NOT NULL THEN 1 END) as hasState,
                COUNT(CASE WHEN ZipCode != '' AND ZipCode IS NOT NULL THEN 1 END) as hasZip,
                COUNT(CASE 
                    WHEN StreetAddress != '' AND StreetAddress IS NOT NULL
                    AND City != '' AND City IS NOT NULL
                    AND (State != '' OR City LIKE '% VA %' OR City LIKE '% MD %' OR City LIKE '% DE %' OR City LIKE '% NC %')
                    AND (ZipCode != '' OR City REGEXP '[0-9]{5}$')
                    THEN 1 END) as hasComplete
            FROM Addresses
        `);
        console.log('Address statistics:', addressStats[0]);

        // Get dealers with addresses, handling various formats
        const [dealers] = await connection.query(`
            SELECT DISTINCT
                d.KPMDealerNumber,
                d.DealershipName,
                a.StreetAddress,
                CASE 
                    WHEN a.City LIKE '% NC %' THEN SUBSTRING_INDEX(a.City, ' NC ', 1)
                    WHEN a.City LIKE '% NC.%' THEN SUBSTRING_INDEX(a.City, ' NC.', 1)
                    WHEN a.City LIKE '% VA %' THEN SUBSTRING_INDEX(a.City, ' VA ', 1)
                    WHEN a.City LIKE '% VA.%' THEN SUBSTRING_INDEX(a.City, ' VA.', 1)
                    WHEN a.City LIKE '% MD %' THEN SUBSTRING_INDEX(a.City, ' MD ', 1)
                    WHEN a.City LIKE '% MD.%' THEN SUBSTRING_INDEX(a.City, ' MD.', 1)
                    WHEN a.City LIKE '% DE %' THEN SUBSTRING_INDEX(a.City, ' DE ', 1)
                    WHEN a.City LIKE '% DE.%' THEN SUBSTRING_INDEX(a.City, ' DE.', 1)
                    WHEN a.City LIKE '% WV %' THEN SUBSTRING_INDEX(a.City, ' WV ', 1)
                    WHEN a.City LIKE '% WV.%' THEN SUBSTRING_INDEX(a.City, ' WV.', 1)
                    WHEN a.City LIKE '% PA %' THEN SUBSTRING_INDEX(a.City, ' PA ', 1)
                    WHEN a.City LIKE '% PA.%' THEN SUBSTRING_INDEX(a.City, ' PA.', 1)
                    ELSE TRIM(a.City)
                END as City,
                CASE 
                    WHEN a.State = '' AND a.City LIKE '% NC%' THEN 'NC'
                    WHEN a.State = '' AND a.City LIKE '% VA%' THEN 'VA'
                    WHEN a.State = '' AND a.City LIKE '% MD%' THEN 'MD'
                    WHEN a.State = '' AND a.City LIKE '% DE%' THEN 'DE'
                    WHEN a.State = '' AND a.City LIKE '% WV%' THEN 'WV'
                    WHEN a.State = '' AND a.City LIKE '% PA%' THEN 'PA'
                    WHEN a.State LIKE '%.%' THEN REPLACE(a.State, '.', '')
                    WHEN LENGTH(a.State) > 2 THEN 
                        CASE 
                            WHEN a.State LIKE '%Virginia%' THEN 'VA'
                            WHEN a.State LIKE '%Maryland%' THEN 'MD'
                            WHEN a.State LIKE '%Delaware%' THEN 'DE'
                            WHEN a.State LIKE '%North Carolina%' THEN 'NC'
                            WHEN a.State LIKE '%West Virginia%' THEN 'WV'
                            WHEN a.State LIKE '%Pennsylvania%' THEN 'PA'
                            ELSE a.State
                        END
                    ELSE a.State
                END as State,
                CASE 
                    WHEN a.ZipCode = '' AND a.City REGEXP '[0-9]{5}$' THEN SUBSTRING(a.City, -5)
                    WHEN a.ZipCode REGEXP '^[0-9]{5}-[0-9]{4}$' THEN SUBSTRING(a.ZipCode, 1, 5)
                    ELSE a.ZipCode
                END as ZipCode,
                a.City as RawCity,
                a.State as RawState,
                a.ZipCode as RawZip
            FROM Dealerships d
            INNER JOIN Addresses a ON d.KPMDealerNumber = a.KPMDealerNumber
            WHERE a.StreetAddress IS NOT NULL 
                AND a.StreetAddress != ''
                AND a.City IS NOT NULL 
                AND a.City != ''
        `);
        
        // Log some sample data for debugging
        console.log('Sample raw addresses:');
        dealers.slice(0, 5).forEach(d => {
            console.log(`${d.DealershipName}:
                Raw: ${d.StreetAddress}, ${d.RawCity}, ${d.RawState} ${d.RawZip}
                Parsed: ${d.StreetAddress}, ${d.City}, ${d.State} ${d.ZipCode}`
            );
        });

        // Add more detailed logging
        console.log('Address Analysis:');
        dealers.forEach(d => {
            if (!d.State || !d.ZipCode) {
                console.log(`\nIncomplete Address for ${d.DealershipName}:`);
                console.log(`Raw: ${d.StreetAddress}, ${d.RawCity}, ${d.RawState} ${d.RawZip}`);
                console.log(`Parsed: ${d.StreetAddress}, ${d.City}, ${d.State} ${d.ZipCode}`);
            }
        });

        // Filter out dealers with incomplete addresses
        const validDealers = dealers.filter(d => 
            d.StreetAddress && 
            d.City && 
            (d.State || d.City.match(/\b(NC|VA|MD|DE|WV)\b/)) &&
            (d.ZipCode || d.City.match(/\d{5}/))
        );

        console.log(`Found ${dealers.length} total dealers`);
        console.log(`Found ${validDealers.length} dealers with valid addresses`);
        
        res.json(validDealers);
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

        // Process each row
        for (const row of rows) {
            // Skip empty rows
            if (!row[0]) continue;

            // Map column indices
            const getColumnValue = (columnName) => {
                const index = headers.indexOf(columnName);
                return index >= 0 ? row[index] || '' : '';
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
            const salesmanCode = getColumnValue('Salesman Code');

            // Skip if no dealer number
            if (!dealerNumber) continue;

            // Update Dealerships table
            await connection.query(`
                INSERT INTO Dealerships 
                    (KPMDealerNumber, DealershipName, DBA, SalesmanCode)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    DealershipName = VALUES(DealershipName),
                    DBA = VALUES(DBA),
                    SalesmanCode = VALUES(SalesmanCode)
            `, [dealerNumber, dealershipName, dba, salesmanCode]);

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

            // Clear existing lines
            await connection.query('DELETE FROM LinesCarried WHERE KPMDealerNumber = ?', [dealerNumber]);

            // Insert new lines
            for (const [column, lineName] of Object.entries(lineColumns)) {
                const accountNumber = getColumnValue(column);
                if (accountNumber) {
                    await connection.query(`
                        INSERT INTO LinesCarried (KPMDealerNumber, LineName, AccountNumber)
                        VALUES (?, ?, ?)
                    `, [dealerNumber, lineName, accountNumber]);
                }
            }
        }

        res.json({ 
            message: 'Import completed successfully',
            rowsProcessed: rows.length 
        });

    } catch (error) {
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