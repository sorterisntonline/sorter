import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np

def load_and_process_data(filename='data.txt'):
    # Read the data
    df = pd.read_csv(filename)
    
    # Group by algorithm and chars to get mean and std of errors
    grouped = df.groupby(['algorithm', 'chars']).agg({
        'error': ['mean', 'std']
    }).reset_index()
    
    # Flatten column names
    grouped.columns = ['algorithm', 'chars', 'error_mean', 'error_std']
    
    return grouped

def create_visualization(data):
    # Set style
    plt.style.use('seaborn')
    
    # Create figure and axis with larger size
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 12), height_ratios=[2, 1])
    
    # Define colors and labels for each algorithm
    algorithm_styles = {
        'pagerank': ('blue', 'PageRank'),
        'rank_centrality': ('red', 'Rank Centrality'),
        'random baseline': ('green', 'Random Baseline')
    }
    
    # Plot lines with error bands
    for algorithm, (color, label) in algorithm_styles.items():
        algo_data = data[data['algorithm'] == algorithm]
        
        # Main line plot
        ax1.plot(algo_data['chars'], algo_data['error_mean'], 
                label=label, color=color, linewidth=2)
        
        # Error band
        ax1.fill_between(algo_data['chars'],
                        algo_data['error_mean'] - algo_data['error_std'],
                        algo_data['error_mean'] + algo_data['error_std'],
                        color=color, alpha=0.2)
    
    # Calculate improvement ratios for both algorithms
    random_data = data[data['algorithm'] == 'random baseline']
    
    for algorithm in ['pagerank', 'rank_centrality']:
        algo_data = data[data['algorithm'] == algorithm]
        improvement_ratio = (random_data['error_mean'].values - 
                           algo_data['error_mean'].values) / random_data['error_mean'].values * 100
        
        color = algorithm_styles[algorithm][0]
        label = f'{algorithm_styles[algorithm][1]} Improvement'
        
        # Plot improvement percentage
        ax2.plot(algo_data['chars'], improvement_ratio, 
                color=color, linewidth=2, label=label)
        ax2.fill_between(algo_data['chars'], 0, improvement_ratio, 
                        color=color, alpha=0.2)
    
    # Customize first subplot
    ax1.set_xlabel('Number of Characters')
    ax1.set_ylabel('Average Number of Errors')
    ax1.set_title('Letter Ordering Algorithm Comparison')
    ax1.legend()
    ax1.grid(True, alpha=0.3)
    
    # Customize second subplot
    ax2.set_xlabel('Number of Characters')
    ax2.set_ylabel('Improvement Over Random (%)')
    ax2.set_title('PageRank Improvement Over Random Baseline')
    ax2.grid(True, alpha=0.3)
    
    # Update statistics text box
    pagerank_mean = data[data['algorithm'] == 'pagerank']['error_mean'].mean()
    centrality_mean = data[data['algorithm'] == 'rank_centrality']['error_mean'].mean()
    random_mean = random_data['error_mean'].mean()
    
    pagerank_improvement = ((random_mean - pagerank_mean) / random_mean) * 100
    centrality_improvement = ((random_mean - centrality_mean) / random_mean) * 100
    
    stats_text = (f'Overall Statistics:\n'
                 f'Avg PageRank Errors: {pagerank_mean:.2f}\n'
                 f'Avg Rank Centrality Errors: {centrality_mean:.2f}\n'
                 f'Avg Random Errors: {random_mean:.2f}\n'
                 f'PageRank Improvement: {pagerank_improvement:.1f}%\n'
                 f'Rank Centrality Improvement: {centrality_improvement:.1f}%')
    
    plt.figtext(0.02, 0.02, stats_text, fontsize=10, 
                bbox=dict(facecolor='white', alpha=0.8))
    
    # Adjust layout and display
    plt.tight_layout()
    plt.savefig('letter_ordering_results.png', dpi=300, bbox_inches='tight')
    plt.close()

def main():
    # Load and process the data
    data = load_and_process_data()
    
    # Create the visualization
    create_visualization(data)
    
    print("Visualization has been saved as 'letter_ordering_results.png'")

if __name__ == "__main__":
    main()
