export const getStudyConductTemplate = () => {
    // A5 Landscape dimensions (595 x 420)
    const PAGE_WIDTH = 595;
    const PAGE_HEIGHT = 420;

    // Helper to center element
    const center = (width) => (PAGE_WIDTH - width) / 2;

    const elements = [
        // --- Header ---
        {
            id: 'h1', type: 'text',
            content: '{{college_name}}',
            x: center(500), y: 20,
            fontSize: 22, font: 'Bold', align: 'center',
            width: 500, height: 30, color: '#1E40AF' // Blue
        },
        {
            id: 'h2', type: 'text',
            content: '(Approved by AICTE, and Affiliated to JNTU, Kakinada)',
            x: center(400), y: 50,
            fontSize: 10, font: 'Helvetica', align: 'center',
            width: 400, height: 15, color: '#1E40AF'
        },
        {
            id: 'h3', type: 'text',
            content: '{{college_address}}',
            x: center(500), y: 65,
            fontSize: 10, font: 'Helvetica', align: 'center',
            width: 500, height: 15, color: '#1E40AF'
        },
        {
            id: 'h4', type: 'text',
            content: 'Ph: {{college_phone}}  Website : {{college_website}}',
            x: center(500), y: 80,
            fontSize: 10, font: 'Helvetica', align: 'center',
            width: 500, height: 15, color: '#1E40AF'
        },
        // Separator Line
        {
            id: 'sep', type: 'line',
            x: 30, y: 95,
            width: 535, height: 2,
            lineWidth: 1.5, color: '#1E40AF'
        },

        // Logo (Top Right)
        {
            id: 'logo', type: 'image',
            content: 'logo',
            x: 480, y: 40,
            width: 70, height: 50
        },

        // Date (Top Right below header)
        {
            id: 'date_label', type: 'text',
            content: 'Date: {{date}}',
            x: 420, y: 105,
            fontSize: 11, font: 'Helvetica', align: 'right',
            width: 140, height: 20, color: '#1E40AF'
        },
        // Date Underline
        { id: 'ul_date', type: 'line', x: 455, y: 117, width: 100, height: 1, color: '#1E40AF' },


        // Title
        {
            id: 'title', type: 'text',
            content: 'STUDY & CONDUCT',
            x: center(300), y: 125,
            fontSize: 18, font: 'Bold', align: 'center',
            width: 300, height: 25, color: '#1E40AF'
        },
        // Title Underline
        {
            id: 'title_ul', type: 'line',
            x: center(180), y: 145,
            width: 180, height: 2,
            lineWidth: 1.5, color: '#1E40AF'
        },

        // Body Content
        // Using "Helvetica" for label, "Bold" for data.

        // Line 1: This is to certify that Mr./Ms. [Name]
        {
            id: 'lbl_1', type: 'text',
            content: 'This is to certify that Mr./Ms.',
            x: 50, y: 170,
            fontSize: 12, font: 'Helvetica', align: 'left',
            width: 200, height: 20, color: '#1E40AF'
        },
        {
            id: 'val_name', type: 'text',
            content: '{{student_name}}',
            x: 230, y: 168, // Slight adjust for baseline
            fontSize: 12, font: 'Bold', align: 'center',
            width: 310, height: 20, color: '#000000'
        },
        { id: 'ul_name', type: 'line', x: 230, y: 182, width: 315, height: 1, color: '#1E40AF' },

        // Line 2: (PIN No. [Pin]) S/o, D/o of Sri [Parent]
        {
            id: 'lbl_2a', type: 'text',
            content: '(PIN No.',
            x: 50, y: 200,
            fontSize: 12, font: 'Helvetica', align: 'left',
            width: 60, height: 20, color: '#1E40AF'
        },
        {
            id: 'val_pin', type: 'text',
            content: '{{pin_no}}',
            x: 105, y: 198,
            fontSize: 12, font: 'Bold', align: 'center',
            width: 100, height: 20, color: '#000000'
        },
        { id: 'ul_pin', type: 'line', x: 105, y: 212, width: 100, height: 1, color: '#1E40AF' },

        {
            id: 'lbl_2b', type: 'text',
            content: ') S/o, D/o of Sri',
            x: 210, y: 200,
            fontSize: 12, font: 'Helvetica', align: 'left',
            width: 100, height: 20, color: '#1E40AF'
        },
        {
            id: 'val_parent', type: 'text',
            content: '{{parent_name}}',
            x: 310, y: 198,
            fontSize: 12, font: 'Bold', align: 'left', // Left align usually looks better for long names
            width: 200, height: 20, color: '#000000'
        },
        { id: 'ul_parent', type: 'line', x: 310, y: 212, width: 200, height: 1, color: '#1E40AF' },

        {
            id: 'lbl_2c', type: 'text',
            content: 'has studied',
            x: 515, y: 200,
            fontSize: 12, font: 'Helvetica', align: 'left',
            width: 80, height: 20, color: '#1E40AF'
        },


        // Line 3: B.Tech/M.Tech in [Course-Branch] during the period from
        {
            id: 'lbl_3a', type: 'text',
            content: 'B.Tech/M.Tech in',
            x: 50, y: 230,
            fontSize: 12, font: 'Helvetica', align: 'left',
            width: 120, height: 20, color: '#1E40AF'
        },
        {
            id: 'val_course', type: 'text',
            content: '{{course}} - {{branch}}',
            x: 150, y: 228,
            fontSize: 12, font: 'Bold', align: 'center',
            width: 280, height: 20, color: '#000000'
        },
        { id: 'ul_course', type: 'line', x: 150, y: 242, width: 280, height: 1, color: '#1E40AF' },

        {
            id: 'lbl_3b', type: 'text',
            content: 'during the period from',
            x: 435, y: 230,
            fontSize: 12, font: 'Helvetica', align: 'left',
            width: 130, height: 20, color: '#1E40AF'
        },

        // Line 4: [From] to [To] in this college. During his / her time of study in this College,
        {
            id: 'val_from', type: 'text',
            content: '{{period_from}}',
            x: 50, y: 258,
            fontSize: 12, font: 'Bold', align: 'center',
            width: 80, height: 20, color: '#000000'
        },
        { id: 'ul_from', type: 'line', x: 50, y: 272, width: 80, height: 1, color: '#1E40AF' },

        {
            id: 'lbl_4a', type: 'text',
            content: 'to',
            x: 135, y: 260,
            fontSize: 12, font: 'Helvetica', align: 'center',
            width: 20, height: 20, color: '#1E40AF'
        },

        {
            id: 'val_to', type: 'text',
            content: '{{period_to}}',
            x: 160, y: 258,
            fontSize: 12, font: 'Bold', align: 'center',
            width: 80, height: 20, color: '#000000'
        },
        { id: 'ul_to', type: 'line', x: 160, y: 272, width: 80, height: 1, color: '#1E40AF' },

        {
            id: 'lbl_4b', type: 'text',
            content: 'in this college. During his / her time of study in this College,',
            x: 245, y: 260,
            fontSize: 12, font: 'Helvetica', align: 'left',
            width: 350, height: 20, color: '#1E40AF'
        },

        // Line 5: his / her Conduct has been found [Conduct]
        {
            id: 'lbl_5', type: 'text',
            content: 'his / her Conduct has been found',
            x: 50, y: 290,
            fontSize: 12, font: 'Helvetica', align: 'left',
            width: 200, height: 20, color: '#1E40AF'
        },
        {
            id: 'val_conduct', type: 'text',
            content: '{{conduct}}',
            x: 250, y: 288,
            fontSize: 12, font: 'Bold', align: 'left',
            width: 200, height: 20, color: '#000000'
        },
        { id: 'ul_conduct', type: 'line', x: 250, y: 302, width: 295, height: 1, color: '#1E40AF' },


        // Signatures
        {
            id: 'seal_label', type: 'text',
            content: 'Seal :',
            x: 80, y: 360,
            fontSize: 12, font: 'Bold', align: 'left',
            width: 100, height: 20, color: '#1E40AF'
        },
        {
            id: 'princ_label', type: 'text',
            content: 'PRINCIPAL',
            x: 430, y: 360,
            fontSize: 12, font: 'Bold', align: 'center',
            width: 135, height: 20, color: '#1E40AF'
        },
    ];

    return elements;
};
