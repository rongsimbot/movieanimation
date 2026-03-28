from flask import Flask, render_template, request, redirect, url_for, jsonify
import os
from werkzeug.utils import secure_filename
import psycopg2
from psycopg2.extras import RealDictCursor

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Create uploads directory if it doesn't exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Store wizard data in memory (in production, use a database)
wizard_data = {}

# Database connection helper
def get_db_connection():
    """Connect to MovieAnimation PostgreSQL database
    
    When running on DESKTOP-EC24FP3: connects directly to localhost:5432
    When running on loserver: use SSH port forwarding or API calls
    """
    return psycopg2.connect(
        host='localhost',
        port=5432,
        database='movieanimation',
        user='sim_admin',
        password='SimData_Vector_2026!'
    )

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/wizard')
def wizard():
    return render_template('wizard.html')

@app.route('/api/wizard/save', methods=['POST'])
def save_wizard_data():
    data = request.json
    step = data.get('step')
    wizard_data[step] = data.get('data')
    return jsonify({'success': True})

@app.route('/api/wizard/upload', methods=['POST'])
def upload_avatar():
    if 'avatar' not in request.files:
        return jsonify({'success': False, 'error': 'No file provided'})
    
    file = request.files['avatar']
    if file.filename == '':
        return jsonify({'success': False, 'error': 'No file selected'})
    
    if file:
        filename = secure_filename(file.filename)
        file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
        return jsonify({'success': True, 'filename': filename})

@app.route('/api/wizard/complete', methods=['POST'])
def complete_wizard():
    final_data = request.json
    # In production, save to database and trigger AI generation
    return jsonify({'success': True, 'message': 'Movie configuration saved!'})

@app.route('/api/animations', methods=['GET'])
def get_animations():
    """Fetch all animations with aggregated data for dashboard"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        query = """
        SELECT 
            a.id,
            a.animation_name,
            s.script_title,
            a.status,
            a.duration_seconds,
            a.last_modified,
            a.file_path,
            (SELECT COUNT(*) FROM chapters WHERE animation_id = a.id) as chapter_count,
            (SELECT COUNT(*) FROM animation_characters WHERE animation_id = a.id) as character_count
        FROM animations a
        LEFT JOIN scripts s ON a.script_id = s.id
        ORDER BY a.last_modified DESC
        """
        
        cursor.execute(query)
        animations = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        return jsonify({'success': True, 'animations': animations})
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8082, debug=False)
