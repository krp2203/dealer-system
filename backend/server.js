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
    let stats = {
        processedCount: 0,
        updatedCount: 0,
        errorCount: 0
    };

    try {
        const { headers, rows } = req.body;
        
        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction();

        for (const row of rows) {
            try {
                const dealerNumber = row[headers.indexOf('KPM Dealer Number')]?.toString().trim();
                if (!dealerNumber) continue;

                // Prepare all possible data
                const dealerData = {
                    dealerNumber,
                    dealershipName: row[headers.indexOf('Dealership Name')]?.toString().trim(),
                    dba: row[headers.indexOf('DBA')]?.toString().trim(),
                    salesmanCode: row[headers.indexOf('Salesman Code')]?.toString().trim() || null,
                    lastUpdated: row[headers.indexOf('Last Updated')]?.toString().trim()
                };

                const addressData = {
                    boxNumber: row[headers.indexOf('Box Number')]?.toString().trim(),
                    streetAddress: row[headers.indexOf('Street Address')]?.toString().trim(),
                    city: row[headers.indexOf('City')]?.toString().trim(),
                    state: row[headers.indexOf('State')]?.toString().trim(),
                    zipCode: row[headers.indexOf('Zip Code')]?.toString().trim(),
                    mapAddress: row[headers.indexOf('Map Address')]?.toString().trim(),
                    county: row[headers.indexOf('County')]?.toString().trim()
                };

                const contactData = {
                    mainPhone: row[headers.indexOf('Main Phone')]?.toString().trim(),
                    faxNumber: row[headers.indexOf('Fax Number')]?.toString().trim(),
                    mainEmail: row[headers.indexOf('Main Email')]?.toString().trim(),
                    secondEmail: row[headers.indexOf('Second Email')]?.toString().trim(),
                    thirdEmail: row[headers.indexOf('Third Email')]?.toString().trim(),
                    forthEmail: row[headers.indexOf('Forth Email')]?.toString().trim(),
                    fifthEmail: row[headers.indexOf('Fifth Email')]?.toString().trim()
                };

                const accountData = {
                    scag: row[headers.indexOf('Scag Account No')]?.toString().trim(),
                    snowWay: row[headers.indexOf('Snow Way Account No')]?.toString().trim(),
                    vortex: row[headers.indexOf('Vortex Account No')]?.toString().trim(),
                    ybravo: row[headers.indexOf('Ybravo Account No')]?.toString().trim(),
                    otr: row[headers.indexOf('OTR Account No.')]?.toString().trim(),
                    ty: row[headers.indexOf('TY Account No')]?.toString().trim(),
                    gg: row[headers.indexOf('GG Account No')]?.toString().trim(),
                    vk: row[headers.indexOf('VK Account No')]?.toString().trim(),
                    bluebird: row[headers.indexOf('Bluebird Account No')]?.toString().trim(),
                    um: row[headers.indexOf('UM Account No')]?.toString().trim(),
                    wright: row[headers.indexOf('Wright Account No.')]?.toString().trim()
                };

                const linesCarried = row[headers.indexOf('Lines Carried')]?.toString().trim();

                // Update Dealerships table
                await connection.query(`
                    INSERT INTO Dealerships 
                        (KPMDealerNumber, DealershipName, DBA, SalesmanCode, LastUpdated)
                    VALUES (?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        DealershipName = VALUES(DealershipName),
                        DBA = VALUES(DBA),
                        SalesmanCode = VALUES(SalesmanCode),
                        LastUpdated = VALUES(LastUpdated)
                `, [
                    dealerData.dealerNumber,
                    dealerData.dealershipName,
                    dealerData.dba || '',
                    dealerData.salesmanCode,
                    dealerData.lastUpdated
                ]);

                // Handle address and geocoding
                if (addressData.streetAddress && addressData.city && addressData.state) {
                    const fullAddress = `${addressData.streetAddress}, ${addressData.city}, ${addressData.state} ${addressData.zipCode}`;
                    const coordinates = await geocodeAddress(fullAddress);
                    
                    if (coordinates) {
                        await connection.query(`
                            INSERT INTO Addresses 
                                (KPMDealerNumber, BoxNumber, StreetAddress, City, State, ZipCode, 
                                 MapAddress, County, lat, lng)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ON DUPLICATE KEY UPDATE
                                BoxNumber = VALUES(BoxNumber),
                                StreetAddress = VALUES(StreetAddress),
                                City = VALUES(City),
                                State = VALUES(State),
                                ZipCode = VALUES(ZipCode),
                                MapAddress = VALUES(MapAddress),
                                County = VALUES(County),
                                lat = VALUES(lat),
                                lng = VALUES(lng)
                        `, [
                            dealerData.dealerNumber,
                            addressData.boxNumber,
                            addressData.streetAddress,
                            addressData.city,
                            addressData.state,
                            addressData.zipCode,
                            addressData.mapAddress,
                            addressData.county,
                            coordinates.lat,
                            coordinates.lng
                        ]);
                    }
                }

                // Update ContactInformation table
                if (Object.values(contactData).some(val => val)) {
                    await connection.query(`
                        INSERT INTO ContactInformation 
                            (KPMDealerNumber, MainPhone, FaxNumber, MainEmail, 
                             SecondEmail, ThirdEmail, ForthEmail, FifthEmail)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                            MainPhone = VALUES(MainPhone),
                            FaxNumber = VALUES(FaxNumber),
                            MainEmail = VALUES(MainEmail),
                            SecondEmail = VALUES(SecondEmail),
                            ThirdEmail = VALUES(ThirdEmail),
                            ForthEmail = VALUES(ForthEmail),
                            FifthEmail = VALUES(FifthEmail)
                    `, [
                        dealerData.dealerNumber,
                        contactData.mainPhone,
                        contactData.faxNumber,
                        contactData.mainEmail,
                        contactData.secondEmail,
                        contactData.thirdEmail,
                        contactData.forthEmail,
                        contactData.fifthEmail
                    ]);
                }

                // Update LinesCarried table
                if (linesCarried) {
                    await connection.query(`
                        INSERT INTO LinesCarried 
                            (KPMDealerNumber, LineName)
                        VALUES (?, ?)
                        ON DUPLICATE KEY UPDATE
                            LineName = VALUES(LineName)
                    `, [
                        dealerData.dealerNumber,
                        linesCarried
                    ]);
                }

                // Update AccountNumbers table
                const accountEntries = Object.entries(accountData).filter(([_, value]) => value);
                for (const [type, number] of accountEntries) {
                    await connection.query(`
                        INSERT INTO AccountNumbers 
                            (KPMDealerNumber, AccountType, AccountNumber)
                        VALUES (?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                            AccountNumber = VALUES(AccountNumber)
                    `, [
                        dealerData.dealerNumber,
                        type,
                        number
                    ]);
                }

                stats.processedCount++;
                stats.updatedCount++;
            } catch (error) {
                console.error('Error processing dealer:', {
                    dealerNumber: dealerData?.dealerNumber,
                    error: error.message
                });
                stats.errorCount++;
            }
        }

        await connection.commit();
        
        // Ensure we always send stats in the response
        res.json({
            success: true,
            message: 'Import completed successfully',
            stats: stats
        });

    } catch (error) {
        if (connection) await connection.rollback();
        // Even on error, send stats
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

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});