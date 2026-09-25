export const getTCTemplate = () => {
    // A4 dimensions
    const PAGE_WIDTH = 595;
    const CENTER_X = PAGE_WIDTH / 2;

    // Helper to center element
    const center = (width) => (PAGE_WIDTH - width) / 2;

    const tcElements = [
        // Header
        {
            id: 'h1', type: 'text',
            content: '{{college_name}}',
            x: center(500), y: 40,
            fontSize: 22, font: 'Bold', align: 'center',
            width: 500, height: 30, color: '#000000'
        },
        {
            id: 'h2', type: 'text',
            content: '(Approved by AICTE, and Affiliated to JNTU, Kakinada)',
            x: center(400), y: 70,
            fontSize: 10, font: 'Helvetica', align: 'center',
            width: 400, height: 15, color: '#000000'
        },
        {
            id: 'h3', type: 'text',
            content: '{{college_address}}',
            x: center(500), y: 85,
            fontSize: 10, font: 'Helvetica', align: 'center',
            width: 500, height: 15, color: '#000000'
        },
        {
            id: 'h4', type: 'text',
            content: 'E-mail: {{college_email}}  Website: {{college_website}}',
            x: center(500), y: 100,
            fontSize: 10, font: 'Helvetica', align: 'center',
            width: 500, height: 15, color: '#000000'
        },
        // Separator Line
        {
            id: 'sep', type: 'line',
            x: 50, y: 115,
            width: 495, height: 2,
            lineWidth: 1, color: '#000000'
        },

        // Logo (Top Right) - Moved down as requested
        {
            id: 'logo', type: 'image',
            content: 'logo',
            x: 480, y: 70,
            width: 80, height: 50
        },

        // Title
        {
            id: 'title', type: 'text',
            content: 'TRANSFER CERTIFICATE',
            x: center(300), y: 135,
            fontSize: 18, font: 'Bold', align: 'center',
            width: 300, height: 25, color: '#000000'
        },

        // Sl No & Date
        {
            id: 'slno', type: 'text',
            content: 'Sl.No. {{serial_no}}',
            x: 50, y: 165,
            fontSize: 11, font: 'Helvetica', align: 'left',
            width: 150, height: 20, color: '#000000'
        },
        {
            id: 'date', type: 'text',
            content: 'Date: {{date}}',
            x: 450, y: 165,
            fontSize: 11, font: 'Helvetica', align: 'left',
            width: 100, height: 20, color: '#000000'
        },
    ];

    // Fields List
    const startY = 195;
    const lineHeight = 28;
    const fields = [
        "1.   Roll No.",
        "2.   Admission Number",
        "3.   Name of the Student",
        "4.   Name of the Parent / Guardian",
        "5.   Nationality & Religion",
        "6.   Date of Birth",
        "7.   Gender",
        "8.   Whether the Student belongs to SC/ST/BC/OC",
        "9.   Medium of Instruction",
        "10.  Date of Admission",
        "11.  Course in which the student was studying",
        "12.  Reason for Leaving",
        "13.  Whether Qualified for Higher Studies",
        "14.  Personal marks of Identification",
        "15.  Date of Leaving the Institution",
        "16.  Conduct"
    ];

    const placeholders = [
        "{{pin_no}}",
        "{{admission_number}}",
        "{{student_name}}",
        "{{parent_name}}",
        "Indian / {{religion}}",
        "{{dob}}",
        "{{gender}}",
        "{{caste}}",
        "English",
        "{{admission_date}}",
        "{{course}} - {{branch}}",
        "{{reason}}",
        "Yes",
        "i) {{mole_1}}\nii) {{mole_2}}",
        "{{date}}",
        "{{conduct}}"
    ];

    fields.forEach((label, idx) => {
        // Shift down items after "Personal marks of Identification" (idx 13) to account for multi-line height
        // "Personal marks" is at idx 13 (14th item)
        // Adjust spacing for items coming AFTER idx 13
        const yOffset = idx > 13 ? 20 : 0;
        const currentY = startY + (idx * lineHeight) + yOffset;

        // Label
        tcElements.push({
            id: `lbl_${idx}`,
            type: 'text',
            content: label,
            x: 60,
            y: currentY,
            fontSize: 11,
            font: 'Helvetica',
            align: 'left',
            width: 250,
            height: 20,
            color: '#000000'
        });

        // Colon
        tcElements.push({
            id: `col_${idx}`,
            type: 'text',
            content: ':',
            x: 320,
            y: currentY,
            fontSize: 11,
            font: 'Bold',
            align: 'center',
            width: 10,
            height: 20,
            color: '#000000'
        });

        // Value
        tcElements.push({
            id: `val_${idx}`,
            type: 'text',
            content: placeholders[idx] || '....................',
            x: 340,
            y: currentY,
            fontSize: 11,
            font: 'Bold',
            align: 'left',
            width: 200,
            height: idx === 13 ? 40 : 20, // Taller for moles
            color: '#000000'
        });
    });

    // Signatures
    // Add extra offset to signature as well
    const sigY = startY + (fields.length * lineHeight) + 60; // Increased spacing
    tcElements.push({
        id: 'seal', type: 'text',
        content: 'Seal :',
        x: 60, y: sigY,
        fontSize: 11, font: 'Bold', align: 'left',
        width: 100, height: 20, color: '#000000'
    });
    tcElements.push({
        id: 'princ', type: 'text',
        content: 'PRINCIPAL',
        x: 450, y: sigY,
        fontSize: 11, font: 'Bold', align: 'center',
        width: 100, height: 20, color: '#000000'
    });

    return tcElements;
};
