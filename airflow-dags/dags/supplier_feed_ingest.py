"""
Airflow DAG for ingesting supplier feeds into Neo4j
Runs daily to import product catalog and pricing data from suppliers
"""

from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.providers.postgres.operators.postgres import PostgresOperator
from datetime import datetime, timedelta
import requests
import os

default_args = {
    'owner': 'companygraph',
    'depends_on_past': False,
    'start_date': datetime(2024, 1, 1),
    'email': ['ops@companygraph.example.com'],
    'email_on_failure': True,
    'email_on_retry': False,
    'retries': 2,
    'retry_delay': timedelta(minutes=5),
}

def extract_supplier_data(**context):
    """Extract data from supplier APIs"""
    suppliers = ['supplier_a', 'supplier_b', 'supplier_c']
    all_data = []
    
    for supplier in suppliers:
        # In production, call actual supplier APIs
        # response = requests.get(f"https://api.{supplier}.com/products")
        # data = response.json()
        # all_data.extend(data)
        pass
    
    # Store data in XCom for next task
    context['task_instance'].xcom_push(key='supplier_data', value=all_data)
    return len(all_data)

def transform_and_load_to_neo4j(**context):
    """Transform data and load into Neo4j"""
    supplier_data = context['task_instance'].xcom_pull(task_ids='extract_supplier_data', key='supplier_data')
    
    # In production, use Neo4j driver to load data
    # from neo4j import GraphDatabase
    # driver = GraphDatabase.driver(os.getenv('NEO4J_URI'), auth=(os.getenv('NEO4J_USER'), os.getenv('NEO4J_PASSWORD')))
    # with driver.session() as session:
    #     for product in supplier_data:
    #         session.run("""
    #             MERGE (p:Product {id: $id})
    #             SET p.name = $name,
    #                 p.supplier = $supplier,
    #                 p.price = $price,
    #                 p.updated_at = datetime()
    #         """, product)
    
    return len(supplier_data) if supplier_data else 0

with DAG(
    'supplier_feed_ingest',
    default_args=default_args,
    description='Daily ingestion of supplier product feeds into Neo4j',
    schedule_interval='0 2 * * *',  # Run daily at 2 AM
    catchup=False,
    max_active_runs=1,
) as dag:
    
    extract_task = PythonOperator(
        task_id='extract_supplier_data',
        python_callable=extract_supplier_data,
    )
    
    transform_load_task = PythonOperator(
        task_id='transform_and_load_to_neo4j',
        python_callable=transform_and_load_to_neo4j,
    )
    
    extract_task >> transform_load_task
