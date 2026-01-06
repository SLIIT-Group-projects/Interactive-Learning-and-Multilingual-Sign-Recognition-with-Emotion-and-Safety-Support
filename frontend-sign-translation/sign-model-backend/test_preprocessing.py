"""
Test script to compare all preprocessing methods
Run this to identify which preprocessing matches your Colab setup
"""
import requests
import base64
import sys
import json

def test_preprocessing(image_path):
    """Test all preprocessing methods with a given image"""
    
    # Load and encode image
    try:
        with open(image_path, 'rb') as f:
            img_data = base64.b64encode(f.read()).decode('utf-8')
    except FileNotFoundError:
        print(f"Error: Image file not found: {image_path}")
        return
    
    # Test endpoint
    url = 'http://localhost:5000/test-preprocessing'
    
    try:
        response = requests.post(url, json={'image': img_data}, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            
            if data.get('success'):
                print("=" * 60)
                print("PREPROCESSING COMPARISON RESULTS")
                print("=" * 60)
                print()
                
                results = data.get('results', {})
                
                for method_name, result in results.items():
                    if 'error' in result:
                        print(f"{method_name.upper()}: ERROR - {result['error']}")
                    else:
                        print(f"{method_name.upper()}:")
                        print(f"  Prediction: {result['prediction']}")
                        print(f"  Confidence: {result['confidence']:.4f}")
                        print(f"  Top 3:")
                        for i, pred in enumerate(result['top_3'], 1):
                            print(f"    {i}. {pred['label']}: {pred['confidence']:.4f}")
                        print()
                
                print("=" * 60)
                print("RECOMMENDATION:")
                print("Compare these results with your Colab predictions.")
                print("The method that matches Colab is the correct one to use.")
                print("=" * 60)
            else:
                print(f"Error: {data.get('error', 'Unknown error')}")
        else:
            print(f"HTTP Error {response.status_code}: {response.text}")
            
    except requests.exceptions.ConnectionError:
        print("Error: Could not connect to server.")
        print("Make sure the Flask server is running on http://localhost:5000")
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python test_preprocessing.py <path_to_image>")
        print("\nExample:")
        print("  python test_preprocessing.py test_image.jpg")
        print("\nThis will test all preprocessing methods and show which one")
        print("gives predictions that match your Colab results.")
        sys.exit(1)
    
    image_path = sys.argv[1]
    test_preprocessing(image_path)














