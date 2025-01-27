import matplotlib.pyplot as plt
import pandas as pd
import sys

# Read data from stdin (output of test_rank.rs)
data = []
for line in sys.stdin:
    num_letters, num_votes, error, trial, ranked_alphabet = line.strip().split(',')
    data.append({
        'num_letters': int(num_letters),
        'num_votes': int(num_votes),
        'error': float(error),
        'trial': int(trial),
        'ranked_alphabet': ranked_alphabet
    })

# Convert to DataFrame
df = pd.DataFrame(data)

# Calculate mean error for each combination of num_letters and num_votes
mean_errors = df.groupby(['num_letters', 'num_votes'])['error'].mean().reset_index()

# Create the plot
plt.figure(figsize=(12, 8))

# Plot lines for each vote ratio
for ratio in ['min', '1x', '2x']:
    mask = mean_errors['num_votes'] == mean_errors['num_letters'] * (2 if ratio == '2x' else 1)
    if ratio == 'min':
        mask = mean_errors['num_votes'] == mean_errors['num_letters'] - 1
    
    data_to_plot = mean_errors[mask]
    plt.plot(
        data_to_plot['num_letters'],
        data_to_plot['error'],
        marker='o',
        label=f'{ratio} votes'
    )

plt.xlabel('Number of Letters')
plt.ylabel('Mean Squared Error')
plt.title('Ranking Error vs Number of Letters')
plt.legend()
plt.grid(True, linestyle='--', alpha=0.7)

# Save the plot
plt.savefig('ranking_error.png')
plt.close()
