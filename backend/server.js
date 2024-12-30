require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// Add error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        error: 'Internal server error',
        details: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

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
    const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: {
        address: address,
        key: GOOGLE_MAPS_API_KEY
      }
    });

    if (response.data.results && response.data.results.length > 0) {
      const location = response.data.results[0].geometry.location;
      return {
        lat: location.lat,
        lng: location.lng
      };
    }
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
};

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
        console.log('Fetching dealers with coordinates...');
        
        // First, let's count total dealers
        const [totalCount] = await connection.query(`
            SELECT COUNT(*) as total FROM Dealerships
        `);
        console.log('Total dealers in database:', totalCount[0].total);

        // Now count dealers with coordinates
        const [coordCount] = await connection.query(`
            SELECT COUNT(*) as total 
            FROM Dealerships d
            JOIN Addresses a ON d.KPMDealerNumber = a.KPMDealerNumber
            WHERE a.lat IS NOT NULL AND a.lng IS NOT NULL
        `);
        console.log('Dealers with coordinates:', coordCount[0].total);

        // Get specific dealers for debugging
        const [salesmanDealers] = await connection.query(`
            SELECT d.KPMDealerNumber, d.SalesmanCode, a.lat, a.lng
            FROM Dealerships d
            LEFT JOIN Addresses a ON d.KPMDealerNumber = a.KPMDealerNumber
            WHERE d.SalesmanCode = '50'
        `);
        console.log('Salesman 50 dealers:', salesmanDealers);

        const [dealers] = await connection.query(`
            SELECT 
                d.KPMDealerNumber,
                d.DealershipName,
                d.DBA,
                d.SalesmanCode,
                s.SalesmanName,
                a.StreetAddress,
                a.City,
                a.State,
                a.ZipCode,
                CAST(a.lat AS DECIMAL(10,8)) as lat,
                CAST(a.lng AS DECIMAL(11,8)) as lng
            FROM Dealerships d
            LEFT JOIN Salesman s ON d.SalesmanCode = s.SalesmanCode
            LEFT JOIN Addresses a ON d.KPMDealerNumber = a.KPMDealerNumber
            WHERE a.lat IS NOT NULL AND a.lng IS NOT NULL
        `);
        
        console.log(`Found ${dealers.length} dealers with coordinates`);
        if (dealers.length > 0) {
            console.log('Sample dealer:', dealers[0]);
        }
        
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
        connection = await mysql.createConnection(dbConfig);

        // First get dealer and address info
        const [dealerInfo] = await connection.query(`
            SELECT 
                d.KPMDealerNumber,
                d.DealershipName,
                d.DBA,
                d.SalesmanCode,
                s.SalesmanName,
                a.StreetAddress,
                a.City,
                a.State,
                a.ZipCode,
                a.County,
                c.MainPhone,
                c.FaxNumber,
                c.MainEmail
            FROM Dealerships d
            LEFT JOIN Salesman s ON d.SalesmanCode = s.SalesmanCode
            LEFT JOIN Addresses a ON d.KPMDealerNumber = a.KPMDealerNumber
            LEFT JOIN ContactInformation c ON d.KPMDealerNumber = c.KPMDealerNumber
            WHERE d.KPMDealerNumber = ?
        `, [req.params.dealerNumber]);

        if (dealerInfo.length === 0) {
            return res.status(404).json({ error: 'Dealer not found' });
        }

        // Then get lines carried separately
        const [linesCarried] = await connection.query(`
            SELECT GROUP_CONCAT(LineName) as LinesCarried
            FROM LinesCarried
            WHERE KPMDealerNumber = ?
            GROUP BY KPMDealerNumber
        `, [req.params.dealerNumber]);

        // Combine the results
        const fullDealerInfo = {
            ...dealerInfo[0],
            LinesCarried: linesCarried[0]?.LinesCarried || ''
        };

        // Add debug logging
        console.log('Dealer details found:', {
            dealerNumber: fullDealerInfo.KPMDealerNumber,
            hasAddress: !!fullDealerInfo.StreetAddress,
            hasContact: !!fullDealerInfo.MainPhone || !!fullDealerInfo.MainEmail,
            hasLines: !!fullDealerInfo.LinesCarried,
            lines: fullDealerInfo.LinesCarried
        });

        res.json(fullDealerInfo);
    } catch (error) {
        console.error('Error fetching dealer details:', error);
        res.status(500).json({ 
            error: 'Failed to fetch dealer details',
            details: error.message 
        });
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
        
        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction();

        let processedCount = 0;
        let updatedCount = 0;
        let errorCount = 0;

        for (const row of rows) {
            try {
                const dealerNumber = row[headers.indexOf('KPM Dealer Number')]?.toString().trim();
                if (!dealerNumber) continue;

                const dealerData = {
                    dealerNumber,
                    dealershipName: row[headers.indexOf('Dealership Name')]?.toString().trim(),
                    dba: row[headers.indexOf('DBA')]?.toString().trim(),
                    streetAddress: row[headers.indexOf('Street Address')]?.toString().trim(),
                    city: row[headers.indexOf('City')]?.toString().trim(),
                    state: row[headers.indexOf('State')]?.toString().trim(),
                    zipCode: row[headers.indexOf('Zip Code')]?.toString().trim(),
                    salesmanCode: row[headers.indexOf('Salesman Code')]?.toString().trim() || null,
                    mainPhone: row[headers.indexOf('Main Phone')]?.toString().trim(),
                    faxNumber: row[headers.indexOf('Fax Number')]?.toString().trim(),
                    mainEmail: row[headers.indexOf('Main Email')]?.toString().trim(),
                    linesCarried: row[headers.indexOf('Lines Carried')]?.toString().trim()
                };

                console.log('Processing dealer data:', {
                    dealerNumber: dealerData.dealerNumber,
                    hasPhone: !!dealerData.mainPhone,
                    hasEmail: !!dealerData.mainEmail,
                    hasLines: !!dealerData.linesCarried,
                    linesCarried: dealerData.linesCarried
                });

                // Update Dealerships table
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
                    dealerData.dba || '',
                    dealerData.salesmanCode,
                    dealerData.salesmanCode
                ]);

                // Update Contact Information
                if (dealerData.mainPhone || dealerData.faxNumber || dealerData.mainEmail) {
                    await connection.query(`
                        INSERT INTO ContactInformation 
                            (KPMDealerNumber, MainPhone, FaxNumber, MainEmail)
                        VALUES (?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                            MainPhone = VALUES(MainPhone),
                            FaxNumber = VALUES(FaxNumber),
                            MainEmail = VALUES(MainEmail)
                    `, [
                        dealerData.dealerNumber,
                        dealerData.mainPhone || '',
                        dealerData.faxNumber || '',
                        dealerData.mainEmail || ''
                    ]);
                }

                // Update Lines Carried
                if (dealerData.linesCarried) {
                    // First, remove existing lines for this dealer
                    await connection.query(
                        'DELETE FROM LinesCarried WHERE KPMDealerNumber = ?',
                        [dealerData.dealerNumber]
                    );

                    // Then insert new lines
                    const lines = dealerData.linesCarried.split(',').map(line => line.trim());
                    for (const line of lines) {
                        await connection.query(`
                            INSERT INTO LinesCarried 
                                (KPMDealerNumber, LineName)
                            VALUES (?, ?)
                        `, [
                            dealerData.dealerNumber,
                            line
                        ]);
                    }
                }

                // Handle address and geocoding (existing code)
                if (dealerData.streetAddress && dealerData.city && dealerData.state) {
                    const fullAddress = `${dealerData.streetAddress}, ${dealerData.city}, ${dealerData.state} ${dealerData.zipCode}`;
                    console.log('Geocoding address:', fullAddress);
                    
                    const coordinates = await geocodeAddress(fullAddress);
                    
                    if (coordinates) {
                        console.log('Got coordinates:', coordinates);
                        
                        // Check if address exists
                        const [existingAddress] = await connection.query(
                            'SELECT * FROM Addresses WHERE KPMDealerNumber = ?',
                            [dealerData.dealerNumber]
                        );

                        if (existingAddress.length === 0) {
                            // Insert new address
                            await connection.query(`
                                INSERT INTO Addresses 
                                    (KPMDealerNumber, StreetAddress, City, State, ZipCode, lat, lng)
                                VALUES (?, ?, ?, ?, ?, ?, ?)
                            `, [
                                dealerData.dealerNumber,
                                dealerData.streetAddress,
                                dealerData.city,
                                dealerData.state,
                                dealerData.zipCode,
                                coordinates.lat,
                                coordinates.lng
                            ]);
                        } else {
                            // Update existing address
                            await connection.query(`
                                UPDATE Addresses 
                                SET StreetAddress = ?,
                                    City = ?,
                                    State = ?,
                                    ZipCode = ?,
                                    lat = ?,
                                    lng = ?
                                WHERE KPMDealerNumber = ?
                            `, [
                                dealerData.streetAddress,
                                dealerData.city,
                                dealerData.state,
                                dealerData.zipCode,
                                coordinates.lat,
                                coordinates.lng,
                                dealerData.dealerNumber
                            ]);
                        }
                    } else {
                        console.error('Failed to geocode address:', fullAddress);
                    }
                }

                console.log('Updated contact info for dealer:', dealerData.dealerNumber);
                console.log('Updated lines carried for dealer:', dealerData.dealerNumber);

                processedCount++;
                updatedCount++;
            } catch (error) {
                console.error('Error processing dealer:', {
                    dealerNumber: dealerData?.dealerNumber,
                    error: error.message
                });
                errorCount++;
            }
        }

        await connection.commit();
        res.json({
            message: 'Import completed successfully',
            stats: { processedCount, updatedCount, errorCount }
        });

    } catch (error) {
        if (connection) await connection.rollback();
        res.status(500).json({
            error: 'Failed to import data',
            details: error.message
        });
    } finally {
        if (connection) await connection.end();
    }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});