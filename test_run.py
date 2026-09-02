from planner import generate_plan
import json
if __name__ == "__main__":
    test_goal = "Check project Apollo status, update it to finished, and notify the team."
    print(f"Testing Goal: '{test_goal}'\n")
    result = generate_plan(test_goal)
    print("Result:")
    print(json.dumps(result, indent=2))
