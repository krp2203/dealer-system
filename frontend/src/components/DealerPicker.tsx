import * as React from 'react';
import { useState, useEffect } from 'react';
import axios from 'axios';

interface Dealer {
    KPMDealerNumber: string;
    DealershipName: string;
    DBA?: string;
}

interface DealerDetails {
    DealershipName: string;
    DBA?: string;
    KPMDealerNumber: string;
    address: {
        StreetAddress: string;
        BoxNumber?: string;
        City: string;
        State: string;
        ZipCode: string;
        County: string;
    };
    contact: {
        MainPhone: string;
        FaxNumber: string;
        MainEmail: string;
    };
    lines: Array<{
        LineName: string;
        AccountNumber: string;
    }>;
    salesman: {
        SalesmanName: string;
        SalesmanCode: string;
    };
}

const API_URL = 'http://35.212.41.99:3002';

function DealerPicker() {
    const [dealers, setDealers] = useState<Dealer[]>([]);
    const [selectedDealer, setSelectedDealer] = useState<string | null>(null);
    const [dealerDetails, setDealerDetails] = useState<DealerDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editedDetails, setEditedDetails] = useState<DealerDetails | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const fetchDealers = async () => {
            try {
                const response = await axios.get<Dealer[]>(`${API_URL}/api/dealers`);
                setDealers(response.data);
                setLoading(false);
            } catch (err) {
                setError('Failed to fetch dealers');
                setLoading(false);
            }
        };

        fetchDealers();
    }, []);

    const handleDealerChange = async (dealerNumber: string) => {
        if (!dealerNumber) {
            setSelectedDealer(null);
            setDealerDetails(null);
            return;
        }

        try {
            console.log('Fetching dealer:', dealerNumber);
            const response = await axios.get<DealerDetails>(`${API_URL}/api/dealers/${dealerNumber}`);
            console.log('Received dealer details:', response.data);
            setSelectedDealer(dealerNumber);
            setDealerDetails(response.data);
        } catch (err) {
            console.error('Fetch error:', err);
            setError('Failed to fetch dealer details');
        }
    };

    const handleEdit = () => {
        setIsEditing(true);
        setEditedDetails(dealerDetails);
    };

    const handleSave = async () => {
        if (!editedDetails) return;
        setIsSaving(true);
        try {
            console.log('Sending data to server:', editedDetails);
            
            const response = await axios.put<DealerDetails>(
                `${API_URL}/api/dealers/${selectedDealer}`, 
                editedDetails
            );
            console.log('Server response:', response.data);
            
            // Update both states with the response data
            setDealerDetails(response.data);
            setEditedDetails(response.data);
            setIsEditing(false);
            
            // Refresh the dealers list
            const dealersResponse = await axios.get<Dealer[]>(`${API_URL}/api/dealers`);
            console.log('Updated dealers list:', dealersResponse.data);
            setDealers(dealersResponse.data);
        } catch (err) {
            console.error('Save error:', err);
            setError('Failed to save dealer details');
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        setIsEditing(false);
        setEditedDetails(dealerDetails);
    };

    const handleInputChange = (section: '' | 'address' | 'contact' | 'salesman', field: string, value: string) => {
        if (!editedDetails) return;

        if (section === '') {
            // Handle root-level properties directly
            setEditedDetails({
                ...editedDetails,
                [field]: value
            });
        } else {
            // Handle nested properties with type checking
            const currentSection = editedDetails[section] as Record<string, string>;
            
            setEditedDetails({
                ...editedDetails,
                [section]: {
                    ...currentSection,
                    [field]: value
                }
            });
        }
    };

    if (loading) return <div>Loading...</div>;
    if (error) return <div>Error: {error}</div>;

    return (
        <div className="dealer-picker">
            <h2>Select a Dealer</h2>
            <select 
                onChange={(e) => handleDealerChange(e.target.value)}
                value={selectedDealer || ''}
            >
                <option value="">Select a dealer...</option>
                {dealers.map(dealer => (
                    <option key={dealer.KPMDealerNumber} value={dealer.KPMDealerNumber}>
                        {dealer.DealershipName} {dealer.DBA ? `(${dealer.DBA})` : ''}
                    </option>
                ))}
            </select>

            {dealerDetails && (
                <div className="dealer-details">
                    <h3>Dealer Information</h3>
                    {!isEditing ? (
                        <button onClick={handleEdit} className="edit-button">Edit</button>
                    ) : (
                        <div className="edit-buttons">
                            <button 
                                onClick={handleSave} 
                                className="save-button"
                                disabled={isSaving}
                            >
                                {isSaving ? 'Saving...' : 'Save'}
                            </button>
                            <button onClick={handleCancel} className="cancel-button">Cancel</button>
                        </div>
                    )}
                    <div className="details-grid">
                        <section>
                            <h4>Basic Information</h4>
                            {isEditing ? (
                                <>
                                    <input
                                        type="text"
                                        value={editedDetails?.DealershipName || ''}
                                        onChange={(e) => handleInputChange('', 'DealershipName', e.target.value)}
                                        placeholder="Dealership Name"
                                    />
                                    <input
                                        type="text"
                                        value={editedDetails?.DBA || ''}
                                        onChange={(e) => handleInputChange('', 'DBA', e.target.value)}
                                        placeholder="DBA"
                                    />
                                </>
                            ) : (
                                <>
                                    <p>Dealer Name: {dealerDetails.DealershipName}</p>
                                    {dealerDetails.DBA && <p>DBA: {dealerDetails.DBA}</p>}
                                </>
                            )}
                            <p>Dealer Number: {dealerDetails.KPMDealerNumber}</p>
                        </section>

                        <section>
                            <h4>Address</h4>
                            {isEditing ? (
                                <>
                                    <input
                                        type="text"
                                        value={editedDetails?.address.StreetAddress || ''}
                                        onChange={(e) => handleInputChange('address', 'StreetAddress', e.target.value)}
                                        placeholder="Street Address"
                                    />
                                    <input
                                        type="text"
                                        value={editedDetails?.address.BoxNumber || ''}
                                        onChange={(e) => handleInputChange('address', 'BoxNumber', e.target.value)}
                                        placeholder="PO Box Number"
                                    />
                                    <input
                                        type="text"
                                        value={editedDetails?.address.City || ''}
                                        onChange={(e) => handleInputChange('address', 'City', e.target.value)}
                                        placeholder="City"
                                    />
                                    <input
                                        type="text"
                                        value={editedDetails?.address.State || ''}
                                        onChange={(e) => handleInputChange('address', 'State', e.target.value)}
                                        placeholder="State"
                                    />
                                    <input
                                        type="text"
                                        value={editedDetails?.address.ZipCode || ''}
                                        onChange={(e) => handleInputChange('address', 'ZipCode', e.target.value)}
                                        placeholder="Zip Code"
                                    />
                                    <input
                                        type="text"
                                        value={editedDetails?.address.County || ''}
                                        onChange={(e) => handleInputChange('address', 'County', e.target.value)}
                                        placeholder="County"
                                    />
                                </>
                            ) : (
                                <>
                                    <p>{dealerDetails.address.StreetAddress}</p>
                                    <p>{dealerDetails.address.BoxNumber && `PO Box ${dealerDetails.address.BoxNumber}`}</p>
                                    <p>{dealerDetails.address.City}, {dealerDetails.address.State} {dealerDetails.address.ZipCode}</p>
                                    <p>County: {dealerDetails.address.County}</p>
                                </>
                            )}
                        </section>

                        <section>
                            <h4>Contact Information</h4>
                            {isEditing ? (
                                <>
                                    <input
                                        type="text"
                                        value={editedDetails?.contact.MainPhone || ''}
                                        onChange={(e) => handleInputChange('contact', 'MainPhone', e.target.value)}
                                        placeholder="Phone"
                                    />
                                    <input
                                        type="text"
                                        value={editedDetails?.contact.FaxNumber || ''}
                                        onChange={(e) => handleInputChange('contact', 'FaxNumber', e.target.value)}
                                        placeholder="Fax"
                                    />
                                    <input
                                        type="email"
                                        value={editedDetails?.contact.MainEmail || ''}
                                        onChange={(e) => handleInputChange('contact', 'MainEmail', e.target.value)}
                                        placeholder="Email"
                                    />
                                </>
                            ) : (
                                <>
                                    <p>Phone: {dealerDetails.contact.MainPhone}</p>
                                    <p>Fax: {dealerDetails.contact.FaxNumber}</p>
                                    <p>Email: {dealerDetails.contact.MainEmail}</p>
                                </>
                            )}
                        </section>

                        <section>
                            <h4>Lines Carried</h4>
                            {isEditing ? (
                                <div className="lines-editor">
                                    {editedDetails?.lines.map((line, index) => (
                                        <div key={index} className="line-item">
                                            <input
                                                type="text"
                                                value={line.LineName}
                                                onChange={(e) => {
                                                    const newLines = [...editedDetails.lines];
                                                    newLines[index] = { ...line, LineName: e.target.value };
                                                    setEditedDetails({ ...editedDetails, lines: newLines });
                                                }}
                                                placeholder="Line Name"
                                            />
                                            <input
                                                type="text"
                                                value={line.AccountNumber}
                                                onChange={(e) => {
                                                    const newLines = [...editedDetails.lines];
                                                    newLines[index] = { ...line, AccountNumber: e.target.value };
                                                    setEditedDetails({ ...editedDetails, lines: newLines });
                                                }}
                                                placeholder="Account Number"
                                            />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <ul>
                                    {dealerDetails.lines.map((line, index) => (
                                        <li key={index}>
                                            {line.LineName} - {line.AccountNumber}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>

                        <section>
                            <h4>Salesman Information</h4>
                            {isEditing ? (
                                <>
                                    <input
                                        type="text"
                                        value={editedDetails?.salesman.SalesmanName || ''}
                                        onChange={(e) => handleInputChange('salesman', 'SalesmanName', e.target.value)}
                                        placeholder="Salesman Name"
                                    />
                                    <input
                                        type="text"
                                        value={editedDetails?.salesman.SalesmanCode || ''}
                                        onChange={(e) => handleInputChange('salesman', 'SalesmanCode', e.target.value)}
                                        placeholder="Salesman Code"
                                    />
                                </>
                            ) : (
                                <>
                                    <p>Name: {dealerDetails.salesman.SalesmanName}</p>
                                    <p>Code: {dealerDetails.salesman.SalesmanCode}</p>
                                </>
                            )}
                        </section>
                    </div>
                </div>
            )}
        </div>
    );
}

export default DealerPicker; 