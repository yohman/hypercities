import requests
import json

# List of sheet names
sheet_names = ['work', 'learn', 'consult', 'musings']

# Spreadsheet ID and API key
spreadsheet_id = '1bQDVVO-R3tt99eR7ageBYu5XK8lnnlxHZLzJghYSLa0'
api_key = 'AIzaSyAxlHpEwRMRcj5qobzddd2oN9FNjWAh0RY'

# Output data dictionary
data = {}

# Function to fetch data from a specific sheet
def fetch_data(sheet_name):
    url = f'https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}/values/{sheet_name}?key={api_key}'
    try:
        response = requests.get(url)
        response.raise_for_status()  # Raise HTTPError for bad responses
        json_data = response.json()

        # Include the first row (headers) in the returned data
        if 'values' in json_data:
            return json_data
        return None
    except requests.exceptions.RequestException as e:
        print(f"Error fetching data for sheet {sheet_name}: {e}")
        return None

# Fetch data for each sheet and store it in the data dictionary
for sheet_name in sheet_names:
    sheet_data = fetch_data(sheet_name)
    if sheet_data and 'values' in sheet_data:
        data[sheet_name] = sheet_data['values']

# Save the data to a JSON file
output_file = 'sheets_data.json'
with open(output_file, 'w') as json_file:
    json.dump(data, json_file, indent=4)

print(f"Data saved to {output_file}")